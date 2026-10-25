//! The scanner's HTTP API, called only by the Yola server (never by browsers).
//!
//! Every route requires `Authorization: Bearer <YOLA_SCANNER_TOKEN>`.
//! Viewing keys arrive in request bodies and are never logged or stored here:
//! the scanner is stateless. The Yola server keeps scan cursors, block hashes
//! and observations in Postgres.

use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use subtle::ConstantTimeEq;
use zcash_protocol::consensus::Network;

use crate::chain::{ChainSource, MAX_RANGE};
use crate::decrypt::{scan_block, scan_tx, summarise, BlockSummary, Match, ScanKey};
use crate::keys::{derive_address, fingerprint, parse_viewing_key, KeyError};

pub const MAX_KEYS: usize = 1_000;

pub struct AppState<C> {
    pub chain: C,
    pub token: String,
    pub network: Network,
    /// The chain name the backend must report ("test").
    pub expected_chain: &'static str,
}

pub struct ApiError(StatusCode, &'static str, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": { "code": self.1, "message": self.2 } }))).into_response()
    }
}

fn bad(code: &'static str, msg: impl Into<String>) -> ApiError {
    ApiError(StatusCode::UNPROCESSABLE_ENTITY, code, msg.into())
}

fn upstream(msg: String) -> ApiError {
    log("warn", "backend_error", json!({ "detail": msg }));
    ApiError(StatusCode::BAD_GATEWAY, "backend_unavailable", "The Zcash backend did not answer.".into())
}

/// One JSON line per event. Callers must never pass key material.
pub fn log(level: &str, event: &str, fields: serde_json::Value) {
    let mut line = json!({ "level": level, "event": event, "service": "yola-scanner" });
    if let (Some(obj), Some(extra)) = (line.as_object_mut(), fields.as_object()) {
        for (k, v) in extra {
            obj.insert(k.clone(), v.clone());
        }
    }
    eprintln!("{line}");
}

fn authorise(headers: &HeaderMap, token: &str) -> Result<(), ApiError> {
    let given = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if given.len() == token.len() && bool::from(given.as_bytes().ct_eq(token.as_bytes())) {
        Ok(())
    } else {
        Err(ApiError(StatusCode::UNAUTHORIZED, "unauthenticated", "Missing or invalid scanner token.".into()))
    }
}

async fn verified_tip<C: ChainSource>(s: &AppState<C>) -> Result<u64, ApiError> {
    let info = s.chain.info().await.map_err(upstream)?;
    if info.chain_name != s.expected_chain {
        log("error", "wrong_chain", json!({ "reported": info.chain_name, "expected": s.expected_chain }));
        return Err(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "wrong_network",
            format!("Backend serves '{}', expected '{}'.", info.chain_name, s.expected_chain),
        ));
    }
    Ok(info.tip_height)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyRef {
    pub id: String,
    pub uivk: String,
}

fn scan_keys(network: &Network, keys: Vec<KeyRef>) -> Result<Vec<ScanKey>, ApiError> {
    if keys.is_empty() || keys.len() > MAX_KEYS {
        return Err(bad("invalid_keys", format!("Send between 1 and {MAX_KEYS} keys.")));
    }
    keys.into_iter()
        .map(|k| {
            let parsed = parse_viewing_key(network, &k.uivk).map_err(|e| bad("invalid_viewing_key", format!("Key '{}': {e}", k.id)))?;
            Ok(ScanKey::new(k.id, parsed.uivk))
        })
        .collect()
}

async fn health<C: ChainSource>(State(s): State<Arc<AppState<C>>>, h: HeaderMap) -> Result<Response, ApiError> {
    authorise(&h, &s.token)?;
    Ok(match s.chain.info().await {
        Ok(info) => {
            let ok = info.chain_name == s.expected_chain;
            let body = json!({
                "status": if ok { "ok" } else { "wrong_network" },
                "chain_name": info.chain_name,
                "expected_chain": s.expected_chain,
                "tip_height": info.tip_height,
                "backend": { "vendor": info.vendor, "version": info.version },
            });
            (if ok { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE }, Json(body)).into_response()
        }
        Err(e) => {
            log("warn", "health_backend_error", json!({ "detail": e }));
            (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "status": "unavailable", "expected_chain": s.expected_chain }))).into_response()
        }
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InspectBody {
    viewing_key: String,
}

async fn inspect<C: ChainSource>(State(s): State<Arc<AppState<C>>>, h: HeaderMap, Json(b): Json<InspectBody>) -> Result<Response, ApiError> {
    authorise(&h, &s.token)?;
    let parsed = parse_viewing_key(&s.network, &b.viewing_key).map_err(|e| {
        let code = match e {
            KeyError::LooksLikeSecret => "secret_material_rejected",
            KeyError::WrongNetwork => "wrong_network",
            KeyError::NoShieldedComponent => "no_shielded_component",
            KeyError::Unrecognised(_) => "invalid_viewing_key",
        };
        bad(code, e.to_string())
    })?;
    // The first derived address doubles as a check the merchant can compare with their wallet.
    let (first_address, first_index) = derive_address(&s.network, &parsed.uivk, 0).map_err(|e| bad("address_derivation_failed", e))?;
    Ok(Json(json!({
        "uivk": parsed.encoded_uivk,
        "fingerprint": fingerprint(&parsed.encoded_uivk),
        "was_full_viewing_key": parsed.was_full_viewing_key,
        "has_sapling": parsed.uivk.has_sapling(),
        "has_orchard": parsed.uivk.has_orchard(),
        "first_address": first_address,
        "first_index": first_index.to_string(),
    }))
    .into_response())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AddressBody {
    uivk: String,
    /// Decimal string: diversifier indices are 88-bit.
    index: String,
}

async fn address<C: ChainSource>(State(s): State<Arc<AppState<C>>>, h: HeaderMap, Json(b): Json<AddressBody>) -> Result<Response, ApiError> {
    authorise(&h, &s.token)?;
    let parsed = parse_viewing_key(&s.network, &b.uivk).map_err(|e| bad("invalid_viewing_key", e.to_string()))?;
    let start: u128 = b.index.parse().map_err(|_| bad("invalid_index", "index must be a decimal string"))?;
    let (address, index) = derive_address(&s.network, &parsed.uivk, start).map_err(|e| bad("address_derivation_failed", e))?;
    Ok(Json(json!({ "address": address, "index": index.to_string() })).into_response())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ScanBody {
    start: u64,
    end: u64,
    keys: Vec<KeyRef>,
}

#[derive(Serialize)]
struct ScanResult {
    tip_height: u64,
    blocks: Vec<BlockSummary>,
    matches: Vec<Match>,
}

async fn scan<C: ChainSource>(State(s): State<Arc<AppState<C>>>, h: HeaderMap, Json(b): Json<ScanBody>) -> Result<Response, ApiError> {
    authorise(&h, &s.token)?;
    if b.end < b.start || b.end - b.start + 1 > MAX_RANGE {
        return Err(bad("invalid_range", format!("end must be >= start and the range at most {MAX_RANGE} blocks.")));
    }
    let keys = scan_keys(&s.network, b.keys)?;
    let tip = verified_tip(&s).await?;
    if b.end > tip {
        return Err(bad("beyond_tip", format!("end {} is beyond the chain tip {tip}.", b.end)));
    }
    let blocks = s.chain.blocks(b.start, b.end).await.map_err(upstream)?;
    let matches: Vec<Match> = blocks.iter().flat_map(|blk| scan_block(&s.network, blk, &keys)).collect();
    log("info", "scan", json!({ "start": b.start, "end": b.end, "keys": keys.len(), "matches": matches.len() }));
    Ok(Json(ScanResult { tip_height: tip, blocks: blocks.iter().map(summarise).collect(), matches }).into_response())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MempoolBody {
    keys: Vec<KeyRef>,
}

async fn mempool<C: ChainSource>(State(s): State<Arc<AppState<C>>>, h: HeaderMap, Json(b): Json<MempoolBody>) -> Result<Response, ApiError> {
    authorise(&h, &s.token)?;
    let keys = scan_keys(&s.network, b.keys)?;
    let tip = verified_tip(&s).await?;
    let txs = s.chain.mempool().await.map_err(upstream)?;
    // Mempool transactions will be mined under the next block's consensus rules.
    let rules = u32::try_from(tip + 1).map_err(|_| upstream("tip height out of range".into()))?;
    let matches: Vec<Match> = txs.iter().flat_map(|tx| scan_tx(&s.network, tx, None, rules, &keys)).collect();
    Ok(Json(json!({ "tip_height": tip, "transactions": txs.len(), "matches": matches })).into_response())
}

async fn block<C: ChainSource>(State(s): State<Arc<AppState<C>>>, h: HeaderMap, Path(height): Path<u64>) -> Result<Response, ApiError> {
    authorise(&h, &s.token)?;
    let tip = verified_tip(&s).await?;
    if height > tip {
        return Err(ApiError(StatusCode::NOT_FOUND, "not_found", format!("No block at {height}; tip is {tip}.")));
    }
    let b = s.chain.block(height).await.map_err(upstream)?;
    Ok(Json(json!({ "tip_height": tip, "block": summarise(&b) })).into_response())
}

pub fn router<C: ChainSource>(state: Arc<AppState<C>>) -> Router {
    Router::new()
        .route("/v1/health", get(health::<C>))
        .route("/v1/keys/inspect", post(inspect::<C>))
        .route("/v1/addresses", post(address::<C>))
        .route("/v1/scan", post(scan::<C>))
        .route("/v1/mempool", post(mempool::<C>))
        .route("/v1/blocks/{height}", get(block::<C>))
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .with_state(state)
}
