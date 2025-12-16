/**
 * Cryptographic utilities for signing commit stats proofs.
 *
 * Uses ECDSA with P-256 curve (secp256r1) via Web Crypto API.
 * This curve is widely supported and circuit-friendly.
 *
 * The keypair is generated locally in the browser and stored in localStorage.
 * The private key never leaves the user's device.
 */

const KEYPAIR_STORAGE_KEY = 'commit-prover-keypair';

export interface StoredKeypair {
  publicKey: string;   // Base64-encoded SPKI format
  privateKey: string;  // Base64-encoded PKCS8 format
}

export interface SignedProof {
  payload: {
    username: string;
    commitCount: number;
    since: string;
    timestamp: number;
  };
  signature: string;   // Base64-encoded signature
  publicKey: string;   // Base64-encoded public key
}

/**
 * Generate a new ECDSA keypair using P-256 curve.
 */
async function generateKeypair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign', 'verify']
  );
}

/**
 * Export a CryptoKey to base64 string.
 */
async function exportKey(key: CryptoKey, format: 'spki' | 'pkcs8'): Promise<string> {
  const exported = await crypto.subtle.exportKey(format, key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

/**
 * Import a base64 key string back to CryptoKey.
 */
async function importKey(
  base64Key: string,
  format: 'spki' | 'pkcs8',
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const binaryString = atob(base64Key);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    format,
    bytes.buffer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    usage
  );
}

/**
 * Get or create the user's keypair.
 * Stores in localStorage for persistence across sessions.
 */
export async function getOrCreateKeypair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyBase64: string;
}> {
  const stored = localStorage.getItem(KEYPAIR_STORAGE_KEY);

  if (stored) {
    const { publicKey, privateKey } = JSON.parse(stored) as StoredKeypair;
    return {
      publicKey: await importKey(publicKey, 'spki', ['verify']),
      privateKey: await importKey(privateKey, 'pkcs8', ['sign']),
      publicKeyBase64: publicKey,
    };
  }

  // Generate new keypair
  const keypair = await generateKeypair();
  const publicKeyBase64 = await exportKey(keypair.publicKey, 'spki');
  const privateKeyBase64 = await exportKey(keypair.privateKey, 'pkcs8');

  // Store for future sessions
  const toStore: StoredKeypair = {
    publicKey: publicKeyBase64,
    privateKey: privateKeyBase64,
  };
  localStorage.setItem(KEYPAIR_STORAGE_KEY, JSON.stringify(toStore));

  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    publicKeyBase64,
  };
}

/**
 * Sign the commit stats payload.
 */
export async function signCommitStats(
  privateKey: CryptoKey,
  publicKeyBase64: string,
  username: string,
  commitCount: number,
  since: string
): Promise<SignedProof> {
  const payload = {
    username,
    commitCount,
    since,
    timestamp: Date.now(),
  };

  // Create canonical JSON string for signing
  const message = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  // Sign with ECDSA
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    privateKey,
    data
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  return {
    payload,
    signature,
    publicKey: publicKeyBase64,
  };
}

/**
 * Verify a signed proof.
 * Can be used by the applicant app or any verifier.
 */
export async function verifySignedProof(proof: SignedProof): Promise<boolean> {
  try {
    const publicKey = await importKey(proof.publicKey, 'spki', ['verify']);

    const message = JSON.stringify(proof.payload);
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const signatureBytes = atob(proof.signature);
    const signatureBuffer = new Uint8Array(signatureBytes.length);
    for (let i = 0; i < signatureBytes.length; i++) {
      signatureBuffer[i] = signatureBytes.charCodeAt(i);
    }

    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      signatureBuffer,
      data
    );
  } catch (error) {
    console.error('Verification failed:', error);
    return false;
  }
}
