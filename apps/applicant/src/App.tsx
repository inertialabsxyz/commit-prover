import { useState, useRef } from 'react'
import { ProofData, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import initNoirC from '@noir-lang/noirc_abi';
import initACVM from '@noir-lang/acvm_js';
import acvm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noirc from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';
import circuit from '../../user/circuit/target/circuit.json';
// Initialize WASM modules
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);

const noir = new Noir(circuit);
const backend = new UltraHonkBackend(circuit.bytecode);

interface Job {
  id: number
  title: string
  company: string
  icon: string
  description: string
  postedDate: string
}

const MOCK_JOBS: Job[] = [
  {
    id: 1,
    title: 'Senior Backend Engineer',
    company: 'TechFlow',
    icon: '🚀',
    description: 'Build scalable distributed systems and APIs for our growing platform.',
    postedDate: '2024-12-15',
  },
  {
    id: 2,
    title: 'Full Stack Developer',
    company: 'CloudBase',
    icon: '☁️',
    description: 'Work on cloud-native applications using modern web technologies.',
    postedDate: '2024-12-14',
  },
  {
    id: 3,
    title: 'Smart Contract Developer',
    company: 'ChainLabs',
    icon: '🔗',
    description: 'Develop and audit smart contracts for DeFi protocols.',
    postedDate: '2024-12-13',
  },
  {
    id: 4,
    title: 'DevOps Engineer',
    company: 'InfraCore',
    icon: '⚙️',
    description: 'Manage CI/CD pipelines and infrastructure automation.',
    postedDate: '2024-12-12',
  },
  {
    id: 5,
    title: 'Frontend Engineer',
    company: 'PixelCraft',
    icon: '🎨',
    description: 'Create beautiful, responsive user interfaces with React.',
    postedDate: '2024-12-11',
  },
  {
    id: 6,
    title: 'Security Engineer',
    company: 'SecureNet',
    icon: '🔒',
    description: 'Identify vulnerabilities and implement security best practices.',
    postedDate: '2024-12-10',
  },
]

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface JobCardProps {
  job: Job
}

function JobCard({ job }: JobCardProps) {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'accepted' | 'rejected'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('verifying')

    try {
      const text = await file.text()
      const proofData = JSON.parse(text)

      // Check that the proof has expected structure
      if (proofData.proof && proofData.publicInputs) {
        console.log("proof input correct")
        // Convert hex string back to Uint8Array
        const proofBytes = Uint8Array.from(
          proofData.proof.match(/.{2}/g)!.map((b: string) => parseInt(b, 16))
        )
        const proofForVerification: ProofData = {
          proof: proofBytes,
          publicInputs: proofData.publicInputs,
        }
        if (await backend.verifyProof(proofForVerification)) {
          setStatus('accepted')
        } else {
          console.log("backend rejected")
          setStatus('rejected')
        }
      } else {
        setStatus('rejected')
      }
    } catch {
      setStatus('rejected')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleReset = () => {
    setStatus('idle')
  }

  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '20px',
      backgroundColor: '#fff',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          fontSize: '32px',
          width: '48px',
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
        }}>
          {job.icon}
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px' }}>{job.title}</h3>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>{job.company}</p>
        </div>
      </div>

      <p style={{ margin: 0, color: '#444', fontSize: '14px', lineHeight: 1.5 }}>
        {job.description}
      </p>

      <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>
        Posted {formatDate(job.postedDate)}
      </p>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        style={{ display: 'none' }}
      />

      {status === 'idle' && (
        <button
          onClick={handleUploadClick}
          style={{
            padding: '10px 16px',
            backgroundColor: '#0066cc',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Submit Proof
        </button>
      )}

      {status === 'verifying' && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          textAlign: 'center',
          color: '#666',
          fontSize: '14px',
        }}>
          Verifying proof...
        </div>
      )}

      {status === 'accepted' && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: '#e8f5e9',
          borderRadius: '4px',
          textAlign: 'center',
          color: '#2e7d32',
          fontSize: '14px',
        }}>
          Proof accepted - Application submitted
        </div>
      )}

      {status === 'rejected' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            padding: '10px 16px',
            backgroundColor: '#ffebee',
            borderRadius: '4px',
            textAlign: 'center',
            color: '#c62828',
            fontSize: '14px',
          }}>
            Invalid proof
          </div>
          <button
            onClick={handleReset}
            style={{
              padding: '8px 12px',
              backgroundColor: '#fff',
              color: '#666',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h1>Job Board</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Submit your ZK proof to apply anonymously. No login required.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '20px',
      }}>
        {MOCK_JOBS.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  )
}

export default App
