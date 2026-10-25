//! End-to-end checks of attribution with real Zcash cryptography:
//! derive keys from a seed (as a wallet would), export the UIVK string,
//! derive a per-request address, encrypt real notes to it in each shielded
//! pool, and confirm the scanner recovers value and diversifier index.

mod common;
use common::*;
use rand::Rng;
use yola_scanner::decrypt::{scan_block, ScanKey};
use yola_scanner::keys::{derive_address, diversifier_to_u128, fingerprint, parse_viewing_key, u128_to_diversifier, KeyError};
use zcash_keys::keys::UnifiedSpendingKey;
use zcash_protocol::consensus::Network;
use zip32::AccountId;

#[test]
fn attributes_payments_in_every_shielded_pool_to_the_right_request() {
    let (uivk_str, _) = wallet();
    let key = parse_viewing_key(&NET, &uivk_str).unwrap();
    let (addr7, j7) = derive_address(&NET, &key.uivk, 7).unwrap();
    let (addr8, j8) = derive_address(&NET, &key.uivk, j7 + 1).unwrap();
    assert!(addr7.starts_with("utest1"), "testnet unified address, got {addr7}");
    assert_ne!(addr7, addr8);
    let ua7 = ua(&addr7);
    let ua8 = ua(&addr8);
    assert!(ua7.transparent().is_none(), "per-request addresses are shielded-only");
    assert!(ua7.sapling().is_some() && ua7.orchard().is_some() && ua8.sapling().is_some());

    let b = block(vec![
        tx(1, vec![sapling_output(*ua7.sapling().unwrap(), 25_000_000)], vec![], vec![]),
        tx(2, vec![], vec![orchard_action(*ua8.orchard().unwrap(), 1_000)], vec![]),
        tx(3, vec![], vec![], vec![ironwood_action(*ua7.orchard().unwrap(), 42)]),
    ]);
    let keys = vec![ScanKey::new("proj_a".into(), key.uivk)];
    let mut m = scan_block(&NET, &b, &keys);
    m.sort_by(|a, b| a.txid.cmp(&b.txid));
    assert_eq!(m.len(), 3);
    let by_pool = |p: &str| m.iter().find(|x| x.pool == p).unwrap().clone();
    let s = by_pool("sapling");
    assert_eq!((s.value_zat.as_str(), s.diversifier_index.clone(), s.height), ("25000000", j7.to_string(), Some(HEIGHT)));
    let o = by_pool("orchard");
    assert_eq!((o.value_zat.as_str(), o.diversifier_index.clone()), ("1000", j8.to_string()));
    let i = by_pool("ironwood");
    assert_eq!((i.value_zat.as_str(), i.diversifier_index.clone(), i.output_index), ("42", j7.to_string(), 0));
    assert!(m.iter().all(|x| x.key_id == "proj_a"));
}

#[test]
fn ignores_payments_to_other_wallets_and_garbage() {
    let (mine, _) = wallet();
    let (theirs, _) = wallet();
    let mine = parse_viewing_key(&NET, &mine).unwrap();
    let theirs = parse_viewing_key(&NET, &theirs).unwrap();
    let (their_addr, _) = derive_address(&NET, &theirs.uivk, 0).unwrap();
    let their_ua = ua(&their_addr);
    let mut junk = sapling_output(*their_ua.sapling().unwrap(), 5);
    junk.ciphertext[3] ^= 0xff;
    let b = block(vec![tx(9, vec![sapling_output(*their_ua.sapling().unwrap(), 5), junk], vec![orchard_action(*their_ua.orchard().unwrap(), 5)], vec![])]);
    assert!(scan_block(&NET, &b, &[ScanKey::new("mine".into(), mine.uivk)]).is_empty());
}

#[test]
fn separates_projects_scanning_the_same_block() {
    let (a, _) = wallet();
    let (b, _) = wallet();
    let a = parse_viewing_key(&NET, &a).unwrap();
    let b = parse_viewing_key(&NET, &b).unwrap();
    let (addr_b, jb) = derive_address(&NET, &b.uivk, 3).unwrap();
    let blk = block(vec![tx(4, vec![], vec![orchard_action(*ua(&addr_b).orchard().unwrap(), 77)], vec![])]);
    let m = scan_block(&NET, &blk, &[ScanKey::new("a".into(), a.uivk), ScanKey::new("b".into(), b.uivk)]);
    assert_eq!(m.len(), 1);
    assert_eq!((m[0].key_id.as_str(), m[0].diversifier_index.clone()), ("b", jb.to_string()));
}

#[test]
fn full_viewing_keys_are_reduced_to_incoming_viewing_keys() {
    let (uivk, ufvk) = wallet();
    let parsed = parse_viewing_key(&NET, &ufvk).unwrap();
    assert!(parsed.was_full_viewing_key);
    assert_eq!(parsed.encoded_uivk, parse_viewing_key(&NET, &uivk).unwrap().encoded_uivk);
    assert!(parsed.encoded_uivk.starts_with("uivktest1") || parsed.encoded_uivk.starts_with("uvitest1"));
    assert_eq!(fingerprint(&parsed.encoded_uivk).len(), 16);
}

#[test]
fn rejects_secrets_wrong_networks_and_junk() {
    let phrase = "abandon ".repeat(23) + "art";
    assert_eq!(parse_viewing_key(&NET, &phrase).err(), Some(KeyError::LooksLikeSecret));
    assert_eq!(parse_viewing_key(&NET, "secret-extended-key-test1qqq").err(), Some(KeyError::LooksLikeSecret));
    assert!(matches!(parse_viewing_key(&NET, "hello"), Err(KeyError::Unrecognised(_))));

    let mut seed = [1u8; 32];
    rng().fill_bytes(&mut seed);
    let main_uivk = UnifiedSpendingKey::from_seed(&Network::MainNetwork, &seed, AccountId::ZERO)
        .unwrap()
        .to_unified_full_viewing_key()
        .to_unified_incoming_viewing_key()
        .encode(&Network::MainNetwork)
        .unwrap();
    assert_eq!(parse_viewing_key(&NET, &main_uivk).err(), Some(KeyError::WrongNetwork));
}

#[test]
fn diversifier_index_round_trips_and_skips_invalid_sapling_indices() {
    for n in [0u128, 1, 255, 1 << 40, (1u128 << 88) - 1] {
        assert_eq!(diversifier_to_u128(&u128_to_diversifier(n).unwrap()), n);
    }
    assert!(u128_to_diversifier(1u128 << 88).is_none());
    let (uivk, _) = wallet();
    let k = parse_viewing_key(&NET, &uivk).unwrap();
    // Roughly half of Sapling diversifier indices are invalid; derivation must land on a valid one >= start.
    let mut last = 0u128;
    let mut skipped = 0;
    for start in 0..40u128 {
        let (addr, found) = derive_address(&NET, &k.uivk, start).unwrap();
        let u = ua(&addr);
        assert!(u.sapling().is_some() && u.orchard().is_some(), "both shielded receivers at index {found}");
        assert!(found >= start && found >= last);
        if found != start { skipped += 1; }
        last = found;
    }
    assert!(skipped > 0, "some Sapling indices are invalid and must be skipped");
}
