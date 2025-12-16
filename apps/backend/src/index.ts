import express from 'express';
import session from 'express-session';
import cors from 'cors';

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

// Get commit count for user over last 3 months
app.get('/api/stats/commits', async (req, res) => {
  if (!req.session.accessToken || !req.session.githubUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const username = req.session.githubUser.login;
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const since = threeMonthsAgo.toISOString().split('T')[0];

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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`\nTo start GitHub OAuth, set these environment variables:`);
  console.log(`  GITHUB_CLIENT_ID=your_client_id`);
  console.log(`  GITHUB_CLIENT_SECRET=your_client_secret`);
});
