import { useState, useEffect } from 'react'

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

function App() {
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commitStats, setCommitStats] = useState<{ count: number; since: string } | null>(null)

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
            <div style={{ color: '#666' }}>
              commits in the last 3 months
            </div>
          </div>

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
