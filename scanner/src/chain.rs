//! Chain access over the lightwalletd gRPC API (`CompactTxStreamer`), which
//! both lightwalletd and Zaino serve. Only read-only RPCs are used: Yola never
//! broadcasts transactions and never holds spending keys.

use std::future::Future;
use std::time::Duration;

use tonic::transport::{Channel, ClientTlsConfig, Endpoint};
use zcash_client_backend::proto::compact_formats::{CompactBlock, CompactTx};
use zcash_client_backend::proto::service::compact_tx_streamer_client::CompactTxStreamerClient;
use zcash_client_backend::proto::service::{BlockId, BlockRange, ChainSpec, Empty, GetMempoolTxRequest};

/// Upper bounds so one request cannot make the scanner buffer unbounded data.
pub const MAX_RANGE: u64 = 1_000;
pub const MAX_MEMPOOL_TXS: usize = 20_000;

#[derive(Debug, Clone)]
pub struct ChainInfo {
    /// "test" or "main", as reported by the backend.
    pub chain_name: String,
    pub tip_height: u64,
    pub vendor: String,
    pub version: String,
}

pub trait ChainSource: Send + Sync + 'static {
    fn info(&self) -> impl Future<Output = Result<ChainInfo, String>> + Send;
    /// Blocks `start..=end` in ascending order.
    fn blocks(&self, start: u64, end: u64) -> impl Future<Output = Result<Vec<CompactBlock>, String>> + Send;
    fn block(&self, height: u64) -> impl Future<Output = Result<CompactBlock, String>> + Send;
    /// A snapshot of shielded mempool transactions.
    fn mempool(&self) -> impl Future<Output = Result<Vec<CompactTx>, String>> + Send;
}

pub struct Lightwalletd {
    client: CompactTxStreamerClient<Channel>,
}

impl Lightwalletd {
    /// Lazily connects: the scanner starts even while the backend is down and
    /// reports that through /v1/health instead of crashing.
    pub fn connect_lazy(url: &str) -> Result<Self, String> {
        let mut endpoint = Endpoint::from_shared(url.to_string())
            .map_err(|e| format!("Invalid lightwalletd URL: {e}"))?
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(60))
            .tcp_keepalive(Some(Duration::from_secs(30)));
        if url.starts_with("https://") {
            endpoint = endpoint
                .tls_config(ClientTlsConfig::new().with_webpki_roots())
                .map_err(|e| format!("TLS configuration failed: {e}"))?;
        }
        Ok(Lightwalletd { client: CompactTxStreamerClient::new(endpoint.connect_lazy()) })
    }
}

fn status(e: tonic::Status) -> String {
    format!("{:?}: {}", e.code(), e.message())
}

impl ChainSource for Lightwalletd {
    async fn info(&self) -> Result<ChainInfo, String> {
        let mut c = self.client.clone();
        let info = c.get_lightd_info(Empty {}).await.map_err(status)?.into_inner();
        // GetLatestBlock is the authoritative tip; LightdInfo.block_height can lag.
        let tip = c.get_latest_block(ChainSpec {}).await.map_err(status)?.into_inner();
        Ok(ChainInfo { chain_name: info.chain_name, tip_height: tip.height, vendor: info.vendor, version: info.version })
    }

    async fn blocks(&self, start: u64, end: u64) -> Result<Vec<CompactBlock>, String> {
        if end < start || end - start + 1 > MAX_RANGE {
            return Err("invalid range".into());
        }
        let mut c = self.client.clone();
        let range = BlockRange {
            start: Some(BlockId { height: start, hash: vec![] }),
            end: Some(BlockId { height: end, hash: vec![] }),
            // Empty means the legacy default: Sapling, Orchard and Ironwood data.
            pool_types: vec![],
        };
        let mut stream = c.get_block_range(range).await.map_err(status)?.into_inner();
        let mut out = Vec::new();
        while let Some(block) = stream.message().await.map_err(status)? {
            out.push(block);
            if out.len() as u64 > MAX_RANGE {
                return Err("backend returned more blocks than requested".into());
            }
        }
        // Guard against a backend that returns gaps or out-of-order data.
        for (i, b) in out.iter().enumerate() {
            if b.height != start + i as u64 {
                return Err(format!("backend returned block {} where {} was expected", b.height, start + i as u64));
            }
        }
        Ok(out)
    }

    async fn block(&self, height: u64) -> Result<CompactBlock, String> {
        let mut c = self.client.clone();
        let b = c.get_block(BlockId { height, hash: vec![] }).await.map_err(status)?.into_inner();
        if b.height != height {
            return Err(format!("backend returned block {} for {height}", b.height));
        }
        Ok(b)
    }

    async fn mempool(&self) -> Result<Vec<CompactTx>, String> {
        let mut c = self.client.clone();
        let req = GetMempoolTxRequest { exclude_txid_suffixes: vec![], pool_types: vec![] };
        let mut stream = c.get_mempool_tx(req).await.map_err(status)?.into_inner();
        let mut out = Vec::new();
        while let Some(tx) = stream.message().await.map_err(status)? {
            out.push(tx);
            if out.len() >= MAX_MEMPOOL_TXS {
                break;
            }
        }
        Ok(out)
    }
}
