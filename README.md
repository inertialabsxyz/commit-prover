# Commit Prover

A zero-knowledge proof application that allows GitHub users to prove they have made more than 100 commits in the last 3 months without revealing their identity.

## Overview

The project uses Noir circuits with UltraHonk proving to generate ZK proofs of GitHub commit activity. Users authenticate via GitHub OAuth, generate a cryptographically signed attestation of their commit count, and produce a ZK proof that can be verified anonymously.

## Architecture

```
apps/
  user/       # React app - authenticate and generate proofs
  applicant/  # React app - submit proofs anonymously for verification
  backend/    # Express server - GitHub OAuth and commit attestation
```

### User App

1. Authenticate with GitHub via OAuth
2. Backend fetches commit count and signs the payload (ECDSA P-256)
3. Client generates a ZK proof using the Noir circuit
4. Proof can be downloaded for later use

### Applicant App

1. Upload a previously generated proof
2. Proof is verified without requiring authentication
3. Applicant remains anonymous

## Circuit

The Noir circuit (`apps/user/circuit/src/main.nr`) verifies:
- Commit count exceeds 100
- Attestation is less than 100 days old
- Backend signature is valid (ECDSA secp256r1)

## Development

```bash
# Install dependencies
npm install

# Run backend
npm run dev:backend

# Run user app
npm run dev:user

# Run applicant app
npm run dev:applicant
```

## Environment Variables

Copy `.envrc.example` to `.envrc` and configure:
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app client secret
