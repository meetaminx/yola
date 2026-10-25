//! HTTP API tests against an in-process fake chain carrying real encrypted notes.

mod common;
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use common::*;
use serde_json::{json, Value};
use tower::ServiceExt;
use yola_scanner::chain::{ChainInfo, ChainSource};
use yola_scanner::server::{router, AppState};
use zcash_client_backend::proto::compact_formats::{CompactBlock, CompactTx};
use zcash_protocol::consensus::Network;

const TOKEN: &str = "test-token-0123456789abcdef0123456789";

struct FakeChain {
    chain_name: &'static str,
    blocks: Vec<CompactBlock>,
    mempool: Vec<CompactTx>,
}

impl ChainSource for FakeChain {
    async fn info(&self) -> Result<ChainInfo, String> {
        Ok(ChainInfo {
            chain_name: self.chain_name.into(),
            tip_height: self.blocks.last().map(|b| b.height).unwrap_or(0),
            vendor: "fake".into(),
            version: "0".into(),
        })
    }
    async fn blocks(&self, start: u64, end: u64) -> Result<Vec<CompactBlock>, String> {
        Ok(self.blocks.iter().filter(|b| b.height >= start && b.height <= end).cloned().collect())
    }
    async fn block(&self, height: u64) -> Result<CompactBlock, String> {
        self.blocks.iter().find(|b| b.height == height).cloned().ok_or("missing".into())
    }
    async fn mempool(&self) -> Result<Vec<CompactTx>, String> {
        Ok(self.mempool.clone())
    }
}

async fn call(app: &axum::Router, method: &str, path: &str, token: Option<&str>, body: Option<Value>) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(path);
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let req = match body {
        Some(b) => req.header("content-type", "application/json").body(Body::from(b.to_string())).unwrap(),
        None => req.body(Body::empty()).unwrap(),
    };
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn app(chain: FakeChain) -> axum::Router {
    router(Arc::new(AppState { chain, token: TOKEN.into(), network: Network::TestNetwork, expected_chain: "test" }))
}

#[tokio::test]
async fn full_flow_inspect_derive_scan_mempool() {
    let (uivk, ufvk) = wallet();
    // Address the merchant's wallet would show for request index 5.
    let k = yola_scanner::keys::parse_viewing_key(&NET, &uivk).unwrap();
    let (addr, idx) = yola_scanner::keys::derive_address(&NET, &k.uivk, 5).unwrap();
    let u = ua(&addr);
    // Heights are post-Canopy so ZIP 212 note plaintexts are the consensus rule.
    let h = HEIGHT as u64;
    let chain = FakeChain {
        chain_name: "test",
        blocks: vec![
            block_at(h, vec![]),
            block_at(h + 1, vec![tx(1, vec![], vec![orchard_action(*u.orchard().unwrap(), 150_000)], vec![])]),
            block_at(h + 2, vec![tx(2, vec![sapling_output(*u.sapling().unwrap(), 50_000)], vec![], vec![])]),
        ],
        mempool: vec![tx(3, vec![], vec![], vec![ironwood_action(*u.orchard().unwrap(), 7)])],
    };
    let app = app(chain);

    let (s, b) = call(&app, "POST", "/v1/keys/inspect", Some(TOKEN), Some(json!({ "viewing_key": ufvk }))).await;
    assert_eq!(s, StatusCode::OK, "{b}");
    assert_eq!(b["uivk"], json!(k.encoded_uivk), "a UFVK is reduced to the UIVK");
    assert_eq!(b["was_full_viewing_key"], json!(true));
    assert!(b["first_address"].as_str().unwrap().starts_with("utest1"));

    let (s, b) = call(&app, "POST", "/v1/addresses", Some(TOKEN), Some(json!({ "uivk": uivk, "index": "5" }))).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(b, json!({ "address": addr, "index": idx.to_string() }));

    let keys = json!([{ "id": "vk_1", "uivk": uivk }]);
    let (s, b) = call(&app, "POST", "/v1/scan", Some(TOKEN), Some(json!({ "start": h, "end": h + 2, "keys": keys }))).await;
    assert_eq!(s, StatusCode::OK, "{b}");
    assert_eq!(b["tip_height"], json!(h + 2));
    assert_eq!(b["blocks"].as_array().unwrap().len(), 3);
    let m = b["matches"].as_array().unwrap();
    assert_eq!(m.len(), 2);
    assert_eq!((m[0]["pool"].clone(), m[0]["value_zat"].clone(), m[0]["height"].clone()), (json!("orchard"), json!("150000"), json!(h + 1)));
    assert_eq!((m[1]["pool"].clone(), m[1]["value_zat"].clone()), (json!("sapling"), json!("50000")));
    assert!(m.iter().all(|x| x["diversifier_index"] == json!(idx.to_string()) && x["key_id"] == json!("vk_1")));
    // txid is display order (byte-reversed) hex
    assert_eq!(m[0]["txid"], json!("01".repeat(32)));

    let (s, b) = call(&app, "POST", "/v1/mempool", Some(TOKEN), Some(json!({ "keys": keys }))).await;
    assert_eq!(s, StatusCode::OK);
    let m = b["matches"].as_array().unwrap();
    assert_eq!(m.len(), 1);
    assert_eq!((m[0]["pool"].clone(), m[0]["height"].clone()), (json!("ironwood"), Value::Null));

    let (s, b) = call(&app, "GET", &format!("/v1/blocks/{}", h + 1), Some(TOKEN), None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(b["block"]["height"], json!(h + 1));
    let (s, _) = call(&app, "GET", &format!("/v1/blocks/{}", h + 10), Some(TOKEN), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn requires_the_bearer_token() {
    let app = app(FakeChain { chain_name: "test", blocks: vec![block_at(1, vec![])], mempool: vec![] });
    for t in [None, Some("wrong"), Some("test-token-0123456789abcdef0123456788")] {
        let (s, b) = call(&app, "GET", "/v1/health", t, None).await;
        assert_eq!(s, StatusCode::UNAUTHORIZED);
        assert_eq!(b["error"]["code"], json!("unauthenticated"));
    }
    let (s, b) = call(&app, "GET", "/v1/health", Some(TOKEN), None).await;
    assert_eq!((s, b["status"].clone(), b["tip_height"].clone()), (StatusCode::OK, json!("ok"), json!(1)));
}

#[tokio::test]
async fn refuses_a_backend_on_the_wrong_network() {
    let (uivk, _) = wallet();
    let app = app(FakeChain { chain_name: "main", blocks: vec![block_at(1, vec![])], mempool: vec![] });
    let (s, b) = call(&app, "GET", "/v1/health", Some(TOKEN), None).await;
    assert_eq!((s, b["status"].clone()), (StatusCode::SERVICE_UNAVAILABLE, json!("wrong_network")));
    let (s, b) = call(&app, "POST", "/v1/scan", Some(TOKEN), Some(json!({ "start": 1, "end": 1, "keys": [{ "id": "a", "uivk": uivk }] }))).await;
    assert_eq!((s, b["error"]["code"].clone()), (StatusCode::SERVICE_UNAVAILABLE, json!("wrong_network")));
}

#[tokio::test]
async fn validates_inputs_and_rejects_secrets() {
    let (uivk, _) = wallet();
    let app = app(FakeChain { chain_name: "test", blocks: vec![block_at(1, vec![]), block_at(2, vec![])], mempool: vec![] });
    let seed = "abandon ".repeat(23) + "art";
    let (s, b) = call(&app, "POST", "/v1/keys/inspect", Some(TOKEN), Some(json!({ "viewing_key": seed }))).await;
    assert_eq!((s, b["error"]["code"].clone()), (StatusCode::UNPROCESSABLE_ENTITY, json!("secret_material_rejected")));
    assert!(!b.to_string().contains("abandon"), "error must not echo the input");

    let k = json!([{ "id": "a", "uivk": uivk }]);
    for (body, code) in [
        (json!({ "start": 2, "end": 1, "keys": k }), "invalid_range"),
        (json!({ "start": 1, "end": 1001, "keys": k }), "invalid_range"),
        (json!({ "start": 1, "end": 5, "keys": k }), "beyond_tip"),
        (json!({ "start": 1, "end": 1, "keys": [] }), "invalid_keys"),
        (json!({ "start": 1, "end": 1, "keys": [{ "id": "a", "uivk": "nope" }] }), "invalid_viewing_key"),
    ] {
        let (s, b) = call(&app, "POST", "/v1/scan", Some(TOKEN), Some(body)).await;
        assert_eq!((s, b["error"]["code"].clone()), (StatusCode::UNPROCESSABLE_ENTITY, json!(code)));
    }
    // Unknown fields are rejected (e.g. someone trying to send a spending key alongside).
    let (s, _) = call(&app, "POST", "/v1/addresses", Some(TOKEN), Some(json!({ "uivk": uivk, "index": "0", "seed": "x" }))).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    let (s, b) = call(&app, "POST", "/v1/addresses", Some(TOKEN), Some(json!({ "uivk": uivk, "index": "-1" }))).await;
    assert_eq!((s, b["error"]["code"].clone()), (StatusCode::UNPROCESSABLE_ENTITY, json!("invalid_index")));
}
