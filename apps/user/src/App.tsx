import { useState, useEffect } from 'react'
import { ProofData, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import initNoirC from '@noir-lang/noirc_abi';
import initACVM from '@noir-lang/acvm_js';
import acvm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noirc from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';
import circuit from '../circuit/target/circuit.json';
// Initialize WASM modules
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);

const API_URL = 'http://localhost:3000'

interface GitHubUser {
  id: number
  login: string
  name: string | null
  avatar_url: string
}

interface Repo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  updated_at: string
}

interface SignedProof {
  payload: {
    username: string
    userId: number
    commitCount: number
    since: string
    timestamp: number
  }
  signature: string
  publicKey: string
}

const noir = new Noir(circuit);
const backend = new UltraHonkBackend(circuit.bytecode);

function App() {
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commitStats, setCommitStats] = useState<{ count: number; since: string } | null>(null)
  const [signedProof, setSignedProof] = useState<SignedProof | null>(null)
  const [generatingProof, setGeneratingProof] = useState(false)
  const [zkProof, setZkProof] = useState<ProofData | null>(null)

  useEffect(() => {
    // Check for OAuth errors in URL
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam) {
      setError(`Authentication failed: ${errorParam}`)
      window.history.replaceState({}, '', '/')
    }

    // Check if user is logged in
    fetchUser()
  }, [])

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/user`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
        fetchRepos()
        fetchCommitStats()
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchRepos = async () => {
    try {
      const res = await fetch(`${API_URL}/api/repos`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setRepos(data.repos)
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err)
    }
  }

  const fetchCommitStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stats/commits`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setCommitStats({ count: data.commitCount, since: data.since })
      }
    } catch (err) {
      console.error('Failed to fetch commit stats:', err)
    }
  }

  const handleLogin = () => {
    window.location.href = `${API_URL}/auth/github`
  }

  const handleLogout = async () => {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    setUser(null)
    setRepos([])
    setCommitStats(null)
    setSignedProof(null)
  }

  const handleGenerateProof = async () => {
    setGeneratingProof(true)
    try {
      const res = await fetch(`${API_URL}/api/stats/commits/proof`, { credentials: 'include' })
      if (res.ok) {
        const proof = await res.json()
        let commits = proof.payload.commitCount;
        const { witness } = await noir.execute({ commits });
        console.log(commits);
        console.log(witness);
        console.log("generating proof");
        const zk = await backend.generateProof(witness);
        console.log("generated proof:",zk.proof);
        setSignedProof(proof)
        setZkProof(zk);
      } else {
        setError('Failed to generate proof')
      }
    } catch (err) {
      console.error('Failed to generate proof:', err)
      setError('Failed to generate signed proof')
    } finally {
      setGeneratingProof(false)
    }
  }

  const handleCopyProof = () => {
    if (signedProof) {
      navigator.clipboard.writeText(JSON.stringify(signedProof, null, 2))
    }
  }

  const handleCopyZkProof = () => {
    if (zkProof) {
      navigator.clipboard.writeText(JSON.stringify(zkProof, null, 2))
    }
  }

  const handleDownloadZkProof = () => {
    if (!zkProof) return

    // Convert proof to hex string for readability
    const proofHex = Array.from(zkProof.proof)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const proofData = {
      proof: proofHex,
      publicInputs: zkProof.publicInputs,
    }

    const blob = new Blob([JSON.stringify(proofData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `commit-proof-${user?.login || 'unknown'}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>User App</h1>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {!user ? (
        <div>
          <p>Sign in with GitHub to view your repositories.</p>
          <button onClick={handleLogin} style={{ padding: '10px 20px', cursor: 'pointer' }}>
            Login with GitHub
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <img
              src={user.avatar_url}
              alt={user.login}
              style={{ width: '40px', height: '40px', borderRadius: '50%' }}
            />
            <span>Welcome, {user.name || user.login}!</span>
            <button onClick={handleLogout} style={{ marginLeft: 'auto', cursor: 'pointer' }}>
              Logout
            </button>
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            marginBottom: '20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
              {commitStats ? commitStats.count.toLocaleString() : '...'}
            </div>
            <div style={{ color: '#666', marginBottom: '15px' }}>
              commits in the last 3 months
            </div>
            <button
              onClick={handleGenerateProof}
              disabled={generatingProof || !commitStats}
              style={{
                padding: '10px 20px',
                cursor: generatingProof ? 'wait' : 'pointer',
                backgroundColor: '#0066cc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
              }}
            >
              {generatingProof ? 'Generating...' : 'Generate Signed Proof'}
            </button>
          </div>

          {signedProof && (
            <div style={{
              padding: '15px',
              backgroundColor: '#e8f5e9',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong>Signed Proof (Application Attested)</strong>
                <button
                  onClick={handleCopyProof}
                  style={{ padding: '5px 10px', cursor: 'pointer' }}
                >
                  Copy to Clipboard
                </button>
              </div>
              <pre style={{
                backgroundColor: '#fff',
                padding: '10px',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
                maxHeight: '200px',
              }}>
                {JSON.stringify(signedProof, null, 2)}
              </pre>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                This proof is signed by the application server (ECDSA P-256).
                Verifiers can validate this against the application's public key at /api/public-key.
              </p>
            </div>
          )}

          {zkProof && (
            <div style={{
              padding: '15px',
              backgroundColor: '#e8f5e9',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong>ZK Proof (Noir UltraHonk)</strong>
              </div>
              <div style={{ marginBottom: '15px', fontSize: '14px' }}>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: '#666' }}>Commits proven: </span>
                    <strong>{signedProof?.payload.commitCount}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Proof size: </span>
                    <strong>{zkProof.proof.length.toLocaleString()} bytes</strong>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Public inputs: </span>
                    <strong>{zkProof.publicInputs.length}</strong>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button
                  onClick={handleCopyZkProof}
                  style={{ padding: '5px 10px', cursor: 'pointer' }}
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={handleDownloadZkProof}
                  style={{
                    padding: '5px 10px',
                    cursor: 'pointer',
                    backgroundColor: '#0066cc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                >
                  Download Proof
                </button>
              </div>
              <pre style={{
                backgroundColor: '#fff',
                padding: '10px',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
                maxHeight: '200px',
              }}>
                {zkProof.proof}
              </pre>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                This ZK proof has been generated here!
              </p>
            </div>
          )}

          <h2>Your Repositories</h2>
          {repos.length === 0 ? (
            <p>Loading repositories...</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {repos.map((repo) => (
                <li
                  key={repo.id}
                  style={{
                    padding: '10px',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
                    {repo.full_name}
                  </a>
                  {repo.description && (
                    <p style={{ margin: '5px 0 0', color: '#666', fontSize: '14px' }}>
                      {repo.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default App
