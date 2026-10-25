//! Shared test helpers: real keys from random seeds and real encrypted notes.
#![allow(dead_code)]

use orchard::note::{ExtractedNoteCommitment, NoteVersion, Nullifier, RandomSeed, Rho};
use orchard::note_encryption::{IronwoodDomain, IronwoodNoteEncryption, OrchardDomain, OrchardNoteEncryption};
use orchard::value::NoteValue as OrchardValue;
use rand::rngs::SysRng;
use rand::Rng;
use rand_core::UnwrapErr;
use sapling_crypto::note_encryption::{sapling_note_encryption, SaplingDomain, COMPACT_NOTE_SIZE};
use sapling_crypto::util::generate_random_rseed;
use sapling_crypto::value::NoteValue as SaplingValue;
use zcash_client_backend::proto::compact_formats::{CompactBlock, CompactOrchardAction, CompactSaplingOutput, CompactTx};
use zcash_keys::address::UnifiedAddress;
use zcash_keys::keys::UnifiedSpendingKey;
use zcash_note_encryption::Domain;
use zcash_primitives::transaction::components::sapling::zip212_enforcement;
use zcash_protocol::consensus::{BlockHeight, Network};
use zip32::AccountId;

pub const NET: Network = Network::TestNetwork;
pub const HEIGHT: u32 = 3_000_000;

pub fn rng() -> UnwrapErr<SysRng> {
    UnwrapErr(SysRng)
}

/// A wallet's exported UIVK and UFVK strings for a fresh random seed.
pub fn wallet() -> (String, String) {
    let mut seed = [0u8; 32];
    rng().fill_bytes(&mut seed);
    let usk = UnifiedSpendingKey::from_seed(&NET, &seed, AccountId::ZERO).unwrap();
    let ufvk = usk.to_unified_full_viewing_key();
    (ufvk.to_unified_incoming_viewing_key().encode(&NET).unwrap(), ufvk.encode(&NET).unwrap())
}

pub fn ua(addr: &str) -> UnifiedAddress {
    match zcash_keys::address::Address::decode(&NET, addr).unwrap() {
        zcash_keys::address::Address::Unified(ua) => *ua,
        _ => panic!("not a unified address"),
    }
}

pub fn sapling_output(to: sapling_crypto::PaymentAddress, value: u64) -> CompactSaplingOutput {
    let zip212 = zip212_enforcement(&NET, BlockHeight::from_u32(HEIGHT));
    let mut r = rng();
    let rseed = generate_random_rseed(zip212, &mut r);
    let note = sapling_crypto::Note::from_parts(to, SaplingValue::from_raw(value), rseed);
    let enc = sapling_note_encryption(None, note.clone(), [0u8; 512], &mut r);
    CompactSaplingOutput {
        cmu: note.cmu().to_bytes().to_vec(),
        ephemeral_key: SaplingDomain::epk_bytes(enc.epk()).0.to_vec(),
        ciphertext: enc.encrypt_note_plaintext().0[..COMPACT_NOTE_SIZE].to_vec(),
    }
}

pub fn orchard_note(to: orchard::Address, value: u64, version: NoteVersion) -> (orchard::Note, Nullifier) {
    let mut r = rng();
    // A compact action's nullifier is the new note's rho, so draw a random
    // canonical field element and use it for both.
    let (nf_old, rho) = loop {
        let mut b = [0u8; 32];
        r.fill_bytes(&mut b);
        b[31] &= 0x3f;
        if let (Some(nf), Some(rho)) = (Option::from(Nullifier::from_bytes(&b)), Option::from(Rho::from_bytes(&b))) {
            break (nf, rho);
        }
    };
    loop {
        let mut bytes = [0u8; 32];
        r.fill_bytes(&mut bytes);
        let Some(rseed) = Option::from(RandomSeed::from_bytes(bytes, &rho)) else { continue };
        if let Some(note) = Option::from(orchard::Note::from_parts(to, OrchardValue::from_raw(value), rho, rseed, version)) {
            return (note, nf_old);
        }
    }
}

pub fn orchard_action(to: orchard::Address, value: u64) -> CompactOrchardAction {
    let (note, nf_old) = orchard_note(to, value, NoteVersion::V2);
    let cmx = ExtractedNoteCommitment::from(note.commitment());
    let enc = OrchardNoteEncryption::new(None, note, [0u8; 512]);
    CompactOrchardAction {
        nullifier: nf_old.to_bytes().to_vec(),
        cmx: cmx.to_bytes().to_vec(),
        ephemeral_key: OrchardDomain::epk_bytes(enc.epk()).0.to_vec(),
        ciphertext: enc.encrypt_note_plaintext().as_ref()[..52].to_vec(),
    }
}

pub fn ironwood_action(to: orchard::Address, value: u64) -> CompactOrchardAction {
    let (note, nf_old) = orchard_note(to, value, NoteVersion::V3);
    let cmx = ExtractedNoteCommitment::from(note.commitment());
    let enc = IronwoodNoteEncryption::new(None, note, [0u8; 512]);
    CompactOrchardAction {
        nullifier: nf_old.to_bytes().to_vec(),
        cmx: cmx.to_bytes().to_vec(),
        ephemeral_key: IronwoodDomain::epk_bytes(enc.epk()).0.to_vec(),
        ciphertext: enc.encrypt_note_plaintext().as_ref()[..52].to_vec(),
    }
}

pub fn block(txs: Vec<CompactTx>) -> CompactBlock {
    CompactBlock { height: HEIGHT as u64, hash: vec![7; 32], prev_hash: vec![6; 32], vtx: txs, ..Default::default() }
}

pub fn tx(id: u8, outputs: Vec<CompactSaplingOutput>, actions: Vec<CompactOrchardAction>, ironwood: Vec<CompactOrchardAction>) -> CompactTx {
    CompactTx { txid: vec![id; 32], outputs, actions, ironwood_actions: ironwood, ..Default::default() }
}


pub fn block_at(height: u64, txs: Vec<CompactTx>) -> CompactBlock {
    let mut hash = vec![0u8; 32];
    hash[..8].copy_from_slice(&height.to_le_bytes());
    let mut prev = vec![0u8; 32];
    prev[..8].copy_from_slice(&(height - 1).to_le_bytes());
    CompactBlock { height, hash, prev_hash: prev, time: 1_700_000_000 + height as u32, vtx: txs, ..Default::default() }
}
