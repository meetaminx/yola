//! Compact trial decryption.
//!
//! For every shielded output in a compact block (Sapling outputs, Orchard
//! actions and, since NU6.3, Ironwood actions), try each merchant's incoming
//! viewing key. A successful decryption proves the output pays that key, and
//! reveals its value and the recipient address, from which the diversifier
//! index (and so the Yola payment request) is recovered.
//!
//! Compact decryption checks the note commitment against the decrypted note,
//! so a match cannot be forged by a malformed output.

use orchard::keys::PreparedIncomingViewingKey as OrchardPreparedIvk;
use orchard::note_encryption::{CompactAction, IronwoodDomain, OrchardDomain};
use sapling_crypto::note_encryption::{try_sapling_compact_note_decryption, CompactOutputDescription, PreparedIncomingViewingKey as SaplingPreparedIvk};
use serde::Serialize;
use zcash_client_backend::proto::compact_formats::{CompactBlock, CompactTx};
use zcash_keys::keys::UnifiedIncomingViewingKey;
use zcash_note_encryption::try_compact_note_decryption;
use zcash_primitives::transaction::components::sapling::zip212_enforcement;
use zcash_primitives::transaction::TxId;
use zcash_protocol::consensus::{BlockHeight, Network};

use crate::keys::diversifier_to_u128;

pub struct ScanKey {
    pub id: String,
    uivk: UnifiedIncomingViewingKey,
    sapling: Option<SaplingPreparedIvk>,
    orchard: Option<OrchardPreparedIvk>,
}

impl ScanKey {
    pub fn new(id: String, uivk: UnifiedIncomingViewingKey) -> Self {
        let sapling = uivk.sapling().as_ref().map(|k| k.prepare());
        let orchard = uivk.orchard().as_ref().map(OrchardPreparedIvk::new);
        ScanKey { id, uivk, sapling, orchard }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Match {
    pub key_id: String,
    /// Transaction ID in the usual display (byte-reversed hex) form.
    pub txid: String,
    pub pool: &'static str,
    /// Index of the output (Sapling) or action (Orchard, Ironwood) within its bundle.
    pub output_index: u32,
    /// Value in zatoshis, as a string (exceeds JS safe integers in theory).
    pub value_zat: String,
    /// Diversifier index of the receiving address, as a decimal string.
    pub diversifier_index: String,
    /// Block height, or null for a mempool transaction.
    pub height: Option<u32>,
}

/// Block header facts the TypeScript side uses for confirmations and reorg detection.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct BlockSummary {
    pub height: u32,
    pub hash: String,
    pub prev_hash: String,
    pub time: u32,
}

pub fn display_hash(bytes: &[u8]) -> String {
    let mut b = bytes.to_vec();
    b.reverse();
    hex::encode(b)
}

pub fn summarise(block: &CompactBlock) -> BlockSummary {
    BlockSummary {
        height: block.height as u32,
        hash: display_hash(&block.hash),
        prev_hash: display_hash(&block.prev_hash),
        time: block.time,
    }
}

/// Trial-decrypt one compact transaction. `height` is None for mempool transactions;
/// `rules_height` is the height whose consensus rules apply (the next block for mempool).
pub fn scan_tx(network: &Network, tx: &CompactTx, height: Option<u32>, rules_height: u32, keys: &[ScanKey]) -> Vec<Match> {
    let mut out = Vec::new();
    if tx.txid.len() != 32 {
        return out;
    }
    let txid = tx.txid();
    let txid_str = TxId::to_string(&txid);
    let zip212 = zip212_enforcement(network, BlockHeight::from_u32(rules_height));

    for (i, output) in tx.outputs.iter().enumerate() {
        let Ok(desc) = CompactOutputDescription::try_from(output) else { continue };
        for key in keys {
            let Some(ivk) = &key.sapling else { continue };
            if let Some((note, addr)) = try_sapling_compact_note_decryption(ivk, &desc, zip212) {
                let Some(j) = key.uivk.sapling().as_ref().and_then(|s| s.decrypt_diversifier(&addr)) else { continue };
                out.push(Match {
                    key_id: key.id.clone(),
                    txid: txid_str.clone(),
                    pool: "sapling",
                    output_index: i as u32,
                    value_zat: note.value().inner().to_string(),
                    diversifier_index: diversifier_to_u128(&j).to_string(),
                    height,
                });
                break;
            }
        }
    }

    for (pool, actions) in [("orchard", &tx.actions), ("ironwood", &tx.ironwood_actions)] {
        for (i, action) in actions.iter().enumerate() {
            let Ok(compact) = CompactAction::try_from(action) else { continue };
            for key in keys {
                let Some(ivk) = &key.orchard else { continue };
                let decrypted = if pool == "orchard" {
                    try_compact_note_decryption(&OrchardDomain::for_compact_action(&compact), ivk, &compact)
                } else {
                    try_compact_note_decryption(&IronwoodDomain::for_compact_action(&compact), ivk, &compact)
                };
                if let Some((note, addr)) = decrypted {
                    let Some(j) = key.uivk.orchard().as_ref().and_then(|o| o.diversifier_index(&addr)) else { continue };
                    out.push(Match {
                        key_id: key.id.clone(),
                        txid: txid_str.clone(),
                        pool,
                        output_index: i as u32,
                        value_zat: note.value().inner().to_string(),
                        diversifier_index: diversifier_to_u128(&j).to_string(),
                        height,
                    });
                    break;
                }
            }
        }
    }
    out
}

pub fn scan_block(network: &Network, block: &CompactBlock, keys: &[ScanKey]) -> Vec<Match> {
    let h = block.height as u32;
    block.vtx.iter().flat_map(|tx| scan_tx(network, tx, Some(h), h, keys)).collect()
}
