/**
 * Application-level cryptographic signing for commit stats proofs.
 *
 * Uses ECDSA with P-256 curve (secp256r1) via Node.js crypto module.
 * The keypair is generated once on server startup and persists in memory.
 * For production, the private key should be stored securely (e.g., env var, HSM).
 *
 * Trust model: Verifiers trust that this application correctly queried GitHub
 * and signed authentic data. The APPLICATION_PUBLIC_KEY should be published
 * or hardcoded in verification circuits.
 */

import crypto from 'crypto';

export interface SignedProof {
  payload: {
    username: string;
    userId: number;
    commitCount: number;
    since: string;
    timestamp: number;
  };
  signature: string;   // Hex-encoded signature
  publicKey: string;   // PEM-encoded public key
}

// Application keypair - generated on startup
// In production, load from environment or secure storage
let privateKey: crypto.KeyObject;
let publicKey: crypto.KeyObject;
let publicKeyPem: string;

/**
 * Initialize the application keypair.
 * Call this once on server startup.
 */
export function initializeKeypair(): void {
  // Check if keypair provided via environment (production)
  if (process.env.APP_PRIVATE_KEY && process.env.APP_PUBLIC_KEY) {
    privateKey = crypto.createPrivateKey(process.env.APP_PRIVATE_KEY);
    publicKey = crypto.createPublicKey(process.env.APP_PUBLIC_KEY);
    publicKeyPem = process.env.APP_PUBLIC_KEY;
    console.log('Loaded application keypair from environment');
  } else {
    // Generate ephemeral keypair (development)
    const keypair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    privateKey = keypair.privateKey;
    publicKey = keypair.publicKey;
    publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    console.log('Generated ephemeral application keypair (development mode)');
    console.log('For production, set APP_PRIVATE_KEY and APP_PUBLIC_KEY environment variables');
  }
}

/**
 * Get the application's public key in PEM format.
 * This should be published or shared with verifiers.
 */
export function getPublicKey(): string {
  return publicKeyPem;
}

/**
 * Sign a commit stats payload with the application's private key.
 */
export function signCommitStats(
  username: string,
  userId: number,
  commitCount: number,
  since: string
): SignedProof {
  const payload = {
    username,
    userId,
    commitCount,
    since,
    timestamp: Date.now(),
  };

  // Create canonical JSON string for signing
  const message = JSON.stringify(payload);

  // Sign with ECDSA using SHA-256
  const sign = crypto.createSign('SHA256');
  sign.update(message);
  sign.end();

  const signature = sign.sign(privateKey, 'hex');

  return {
    payload,
    signature,
    publicKey: publicKeyPem,
  };
}

/**
 * Verify a signed proof.
 * Can be used by any verifier with the application's public key.
 */
export function verifySignedProof(proof: SignedProof): boolean {
  try {
    const message = JSON.stringify(proof.payload);

    const verify = crypto.createVerify('SHA256');
    verify.update(message);
    verify.end();

    // Verify against the provided public key (or use the known application key)
    const pubKey = crypto.createPublicKey(proof.publicKey);
    return verify.verify(pubKey, proof.signature, 'hex');
  } catch (error) {
    console.error('Verification failed:', error);
    return false;
  }
}
