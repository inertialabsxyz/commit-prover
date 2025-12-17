global COMMITS: u8 = 100;
global DAY: u32 = 60 * 60 * 24;

fn main(
    commits: u8,
    now: u32,
    timestamp: u32,
    hashed_message: [u8; 32],
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    signature: [u8; 64],
) {
    assert(commits > COMMITS);
    assert(now - timestamp < 101 * DAY);
    let valid_signature =
        std::ecdsa_secp256r1::verify_signature(pub_key_x, pub_key_y, signature, hashed_message);
    assert(valid_signature);
}
