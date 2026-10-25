//! Viewing keys and per-request addresses.
//!
//! Yola stores only a unified *incoming* viewing key (UIVK): it can derive
//! receiving addresses and detect incoming payments, but cannot spend and
//! cannot see outgoing transactions. A merchant may paste a full viewing key
//! (UFVK); it is reduced to its UIVK here and only the UIVK is returned.

use sha2::{Digest, Sha256};
use zcash_keys::address::UnifiedAddress;
use zcash_keys::keys::{ReceiverRequirement, UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedIncomingViewingKey};
use zcash_protocol::consensus::Network;
use zip32::DiversifierIndex;

#[derive(Debug, PartialEq, Eq)]
pub enum KeyError {
    /// Looks like a seed phrase or spending key. Never accepted.
    LooksLikeSecret,
    /// Not a unified viewing key for this network.
    Unrecognised(String),
    /// Encoded for the other network.
    WrongNetwork,
    /// Has no Sapling or Orchard component, so it cannot receive shielded payments.
    NoShieldedComponent,
}

impl std::fmt::Display for KeyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeyError::LooksLikeSecret => write!(f, "This looks like a seed phrase or spending key. Never share those. Export a unified viewing key instead."),
            KeyError::Unrecognised(e) => write!(f, "Not a valid unified viewing key: {e}"),
            KeyError::WrongNetwork => write!(f, "This viewing key is for a different network."),
            KeyError::NoShieldedComponent => write!(f, "This viewing key has no Sapling or Orchard component."),
        }
    }
}

pub struct ParsedKey {
    pub uivk: UnifiedIncomingViewingKey,
    /// Canonical UIVK encoding: the only form Yola stores.
    pub encoded_uivk: String,
    pub was_full_viewing_key: bool,
}

/// First 16 hex chars of SHA-256 over the canonical UIVK encoding.
pub fn fingerprint(encoded_uivk: &str) -> String {
    hex::encode(&Sha256::digest(encoded_uivk.as_bytes())[..8])
}

fn looks_like_secret(s: &str) -> bool {
    let words = s.split_whitespace().count();
    // BIP 39 mnemonics are 12-24 words; spending keys have these prefixes.
    words >= 12 || s.starts_with("secret-extended-key") || s.starts_with("uskt") || s.starts_with("usk1") || s.starts_with("SK")
}

pub fn parse_viewing_key(network: &Network, input: &str) -> Result<ParsedKey, KeyError> {
    let s = input.trim();
    if looks_like_secret(s) {
        return Err(KeyError::LooksLikeSecret);
    }
    let (uivk, was_full) = match UnifiedIncomingViewingKey::decode(network, s) {
        Ok(k) => (k, false),
        Err(ivk_err) => match UnifiedFullViewingKey::decode(network, s) {
            Ok(fvk) => (fvk.to_unified_incoming_viewing_key(), true),
            Err(fvk_err) => {
                let msg = format!("{ivk_err}; {fvk_err}");
                if msg.contains("etwork") {
                    return Err(KeyError::WrongNetwork);
                }
                return Err(KeyError::Unrecognised(ivk_err.to_string()));
            }
        },
    };
    if !uivk.has_sapling() && !uivk.has_orchard() {
        return Err(KeyError::NoShieldedComponent);
    }
    let encoded_uivk = uivk.encode(network).map_err(|e| KeyError::Unrecognised(e.to_string()))?;
    Ok(ParsedKey { uivk, encoded_uivk, was_full_viewing_key: was_full })
}

pub fn diversifier_to_u128(j: &DiversifierIndex) -> u128 {
    let mut bytes = [0u8; 16];
    bytes[..11].copy_from_slice(j.as_bytes());
    u128::from_le_bytes(bytes)
}

pub fn u128_to_diversifier(n: u128) -> Option<DiversifierIndex> {
    let bytes = n.to_le_bytes();
    if bytes[11..].iter().any(|b| *b != 0) {
        return None; // beyond the 88-bit diversifier space
    }
    let mut d = [0u8; 11];
    d.copy_from_slice(&bytes[..11]);
    Some(DiversifierIndex::from(d))
}

/// The shielded-only unified address at the first diversifier index >= `start`
/// that yields every shielded receiver the key supports.
///
/// Receivers the key has are *required*, not merely allowed: with "allow",
/// zcash_keys silently drops the Sapling receiver at indices where the Sapling
/// diversifier is invalid (about half of them), producing addresses that
/// Sapling-only wallets cannot pay. Requiring it makes `find_address` skip
/// forward to an index where both receivers exist.
///
/// Never includes a transparent receiver, so customers cannot pay transparently by mistake.
pub fn derive_address(network: &Network, uivk: &UnifiedIncomingViewingKey, start: u128) -> Result<(String, u128), String> {
    let j = u128_to_diversifier(start).ok_or("Diversifier index out of range")?;
    let need = |has: bool| if has { ReceiverRequirement::Require } else { ReceiverRequirement::Omit };
    let request = UnifiedAddressRequest::custom(need(uivk.has_orchard()), need(uivk.has_sapling()), ReceiverRequirement::Omit)
        .map_err(|e| format!("{e:?}"))?;
    let (ua, found): (UnifiedAddress, DiversifierIndex) = uivk.find_address(j, request).map_err(|e| format!("{e:?}"))?;
    if ua.transparent().is_some() {
        return Err("Derived address unexpectedly contains a transparent receiver".into());
    }
    Ok((ua.encode(network), diversifier_to_u128(&found)))
}
