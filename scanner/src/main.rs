//! yola-scanner: a stateless service the Yola server calls to derive
//! per-request receiving addresses from a merchant's unified incoming viewing
//! key and to trial-decrypt compact blocks from lightwalletd or Zaino.
//!
//! Configuration (environment):
//!   YOLA_SCANNER_LIGHTWALLETD_URL  gRPC URL of a lightwalletd or Zaino testnet server (required)
//!   YOLA_SCANNER_TOKEN             bearer token the Yola server sends, 32+ chars (required)
//!   YOLA_SCANNER_LISTEN            listen address, default 127.0.0.1:9077
//!   YOLA_SCANNER_NETWORK           must be "test"; mainnet is refused in this release

use std::net::SocketAddr;
use std::sync::Arc;

use serde_json::json;
use yola_scanner::chain::Lightwalletd;
use yola_scanner::server::{log, router, AppState};
use zcash_protocol::consensus::Network;

fn fail(msg: &str) -> ! {
    log("error", "config_error", json!({ "message": msg }));
    std::process::exit(2);
}

#[tokio::main]
async fn main() {
    let network = std::env::var("YOLA_SCANNER_NETWORK").unwrap_or_else(|_| "test".into());
    if network != "test" {
        fail("YOLA_SCANNER_NETWORK must be \"test\". Mainnet scanning is disabled in this release.");
    }
    let token = std::env::var("YOLA_SCANNER_TOKEN").unwrap_or_default();
    if token.len() < 32 {
        fail("YOLA_SCANNER_TOKEN must be set to at least 32 characters.");
    }
    let url = std::env::var("YOLA_SCANNER_LIGHTWALLETD_URL").unwrap_or_default();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        fail("YOLA_SCANNER_LIGHTWALLETD_URL must be an http:// or https:// gRPC URL.");
    }
    let listen: SocketAddr = std::env::var("YOLA_SCANNER_LISTEN")
        .unwrap_or_else(|_| "127.0.0.1:9077".into())
        .parse()
        .unwrap_or_else(|_| fail("YOLA_SCANNER_LISTEN must be host:port."));

    let chain = Lightwalletd::connect_lazy(&url).unwrap_or_else(|e| fail(&e));
    let state = Arc::new(AppState { chain, token, network: Network::TestNetwork, expected_chain: "test" });
    let app = router(state);

    let listener = tokio::net::TcpListener::bind(listen).await.unwrap_or_else(|e| fail(&format!("bind {listen}: {e}")));
    // The backend URL is logged without any credentials it might carry in userinfo.
    let shown = url.split('@').next_back().unwrap_or("");
    log("info", "listening", json!({ "listen": listen.to_string(), "backend": shown, "network": "test" }));
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .unwrap_or_else(|e| fail(&format!("server error: {e}")));
}
