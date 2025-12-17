import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { initializeKeypair, signCommitStats, getPublicKey } from './crypto.js';

// Extend session type to include our custom fields
declare module 'express-session' {
  interface SessionData {
    accessToken?: string;
    githubUser?: {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
    };
  }
}

const app = express();
const PORT = 3000;

// GitHub OAuth config - set these in your environment
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'your_client_id';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'your_client_secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Redirect user to GitHub for authentication
app.get('/auth/github', (req, res) => {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `http://localhost:${PORT}/auth/callback`,
    scope: 'repo read:user',
    state: crypto.randomUUID(),
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GitHub callback - exchange code for token
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.redirect(`${FRONTEND_URL}?error=no_code`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token error:', tokenData);
      return res.redirect(`${FRONTEND_URL}?error=token_error`);
    }

    const accessToken = tokenData.access_token;

    // Fetch user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
      },
    });

    const userData = await userResponse.json();

    // Store in session
    req.session.accessToken = accessToken;
    req.session.githubUser = {
      id: userData.id,
      login: userData.login,
      name: userData.name,
      avatar_url: userData.avatar_url,
    };

    res.redirect(FRONTEND_URL);
  } catch (error) {
    console.error('OAuth error:', error);
    res.redirect(`${FRONTEND_URL}?error=oauth_failed`);
  }
});

// Get current user info
app.get('/auth/user', (req, res) => {
  if (!req.session.githubUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({ user: req.session.githubUser });
});

// Logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Get user's repositories
app.get('/api/repos', async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        'Authorization': `Bearer ${req.session.accessToken}`,
        'Accept': 'application/vnd.github+json',
      },
    });

    const repos = await response.json();
    res.json({ repos });
  } catch (error) {
    console.error('Repos error:', error);
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
});

/**
 * Get commit count for the authenticated user over the last 3 months.
 *
 * Uses GitHub's Search API to count commits where the user is the author.
 *
 * What this returns:
 * - Commits where the user is the author (matched by GitHub username)
 * - Across all public repositories on GitHub
 * - Plus private repositories the user has access to (via their OAuth token)
 *
 * Limitations:
 * - Only indexed commits: GitHub's Search API only indexes commits from repositories
 *   that have been indexed. Very new repos or commits may have a slight delay.
 * - Author matching: Matches by GitHub username, not email. Commits made with an
 *   email not linked to the user's GitHub account won't be counted.
 * - 1,000 result cap: Search API returns max 1,000 results, but total_count should
 *   still reflect the true count (up to GitHub's internal limits).
 * - Rate limiting: Search API has stricter rate limits (30 requests/minute authenticated).
 * - Forks: Commits to forks are only included if the fork has more stars than the parent.
 */
app.get('/api/stats/commits', async (req, res) => {
  if (!req.session.accessToken || !req.session.githubUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const username = req.session.githubUser.login;
  const since = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  try {
    // Use GitHub Search API to count commits by user in last 3 months
    const response = await fetch(
      `https://api.github.com/search/commits?q=author:${username}+committer-date:>=${since}&per_page=1`,
      {
        headers: {
          'Authorization': `Bearer ${req.session.accessToken}`,
          'Accept': 'application/vnd.github+json',
        },
      }
    );

    const data = await response.json();
    res.json({
      commitCount: data.total_count || 0,
      since,
    });
  } catch (error) {
    console.error('Commit stats error:', error);
    res.status(500).json({ error: 'Failed to fetch commit stats' });
  }
});

/**
 * Get a signed proof of the user's commit count.
 * The proof is signed by the application's private key.
 * Verifiers can check the signature against the application's public key.
 */
app.get('/api/stats/commits/proof', async (req, res) => {
  if (!req.session.accessToken || !req.session.githubUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { login: username, id: userId } = req.session.githubUser;
  const since = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  try {
    // Fetch commit count from GitHub
    const response = await fetch(
      `https://api.github.com/search/commits?q=author:${username}+committer-date:>=${since}&per_page=1`,
      {
        headers: {
          'Authorization': `Bearer ${req.session.accessToken}`,
          'Accept': 'application/vnd.github+json',
        },
      }
    );

    const data = await response.json();
    const commitCount = data.total_count || 0;

    // Sign the payload with application key
    const signedProof = signCommitStats(username, userId, commitCount, since);

    res.json(signedProof);
  } catch (error) {
    console.error('Proof generation error:', error);
    res.status(500).json({ error: 'Failed to generate proof' });
  }
});

/**
 * Get the application's public key.
 * Verifiers use this to validate signed proofs.
 */
app.get('/api/public-key', (req, res) => {
  res.json({ publicKey: getPublicKey() });
});

// Get commits for a specific repo
app.get('/api/repos/:owner/:repo/commits', async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { owner, repo } = req.params;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`,
      {
        headers: {
          'Authorization': `Bearer ${req.session.accessToken}`,
          'Accept': 'application/vnd.github+json',
        },
      }
    );

    const commits = await response.json();
    res.json({ commits });
  } catch (error) {
    console.error('Commits error:', error);
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// Initialize application keypair before starting server
initializeKeypair();

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`\nTo start GitHub OAuth, set these environment variables:`);
  console.log(`  GITHUB_CLIENT_ID=your_client_id`);
  console.log(`  GITHUB_CLIENT_SECRET=your_client_secret`);
});
