// ============================================================
// Cloudflare Worker: Spaced Repetition Memory API
// ============================================================
// Secrets (set via `wrangler secret put`):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   JWT_SECRET
// ============================================================

// ---- Base64url ----

function b64url(input) {
  const str = typeof input === 'string'
    ? btoa(unescape(encodeURIComponent(input)))
    : btoa(String.fromCharCode(...new Uint8Array(input)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

// ---- JWT ----

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function createJWT(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const key = await hmacKey(secret);
  const data = `${parts[0]}.${parts[1]}`;
  const sigStr = parts[2].replace(/-/g, '+').replace(/_/g, '/');
  const padded = sigStr + '='.repeat((4 - sigStr.length % 4) % 4);
  const sigBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) return null;
  const payload = JSON.parse(b64urlDecode(parts[1]));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ---- Auth middleware ----

async function getUser(request, env) {
  // Check Authorization header (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return verifyJWT(token, env.JWT_SECRET);
  }
  return null;
}

// ---- CORS ----

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.SITE_URL || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function addCors(response, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(env))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// ---- Response helpers ----

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ---- Auth handlers ----

async function handleLogin(request, env) {
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();

  // Store state in a short-lived cookie (same Worker origin, so this works)
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/memory/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'Set-Cookie': `mem_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    }
  });
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const origin = url.origin;
  const siteUrl = env.SITE_URL || origin;

  if (error || !code) {
    return Response.redirect(`${siteUrl}/memory/#/`, 302);
  }

  // Verify state cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  }
  if (!state || state !== cookies.mem_oauth_state) {
    return json({ error: 'Invalid OAuth state' }, 400);
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/api/memory/auth/callback`,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    return json({ error: 'Token exchange failed', detail: errBody }, 400);
  }
  const tokens = await tokenRes.json();

  // Get user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  if (!userRes.ok) {
    return json({ error: 'Failed to get user info' }, 400);
  }
  const gUser = await userRes.json();

  // Upsert user in D1
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar`
  ).bind(gUser.id, gUser.email, gUser.name || '', gUser.picture || '').run();

  // Create JWT (30-day expiry)
  const now = Math.floor(Date.now() / 1000);
  const jwt = await createJWT({
    sub: gUser.id,
    email: gUser.email,
    name: gUser.name || '',
    picture: gUser.picture || '',
    iat: now,
    exp: now + 30 * 24 * 3600
  }, env.JWT_SECRET);

  // Redirect to frontend with token in hash (frontend stores it in localStorage)
  return Response.redirect(`${siteUrl}/memory/#/auth/${jwt}`, 302);
}

async function handleMe(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  return json({
    id: user.sub,
    email: user.email,
    displayName: user.name,
    photoURL: user.picture
  });
}

function handleLogout() {
  return json({ ok: true });
}

// ---- Deck handlers ----

async function handleListDecks(user, env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM decks WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(user.sub).all();

  const decks = results.map(row => ({
    id: row.id,
    title: row.title,
    status: row.status,
    cards: JSON.parse(row.cards || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  return json(decks);
}

async function handleCreateDeck(request, user, env) {
  const body = await request.json();
  if (!body.title || typeof body.title !== 'string') {
    return json({ error: 'Title is required' }, 400);
  }
  const id = crypto.randomUUID();
  const cards = JSON.stringify(Array.isArray(body.cards) ? body.cards : []);

  await env.DB.prepare(
    'INSERT INTO decks (id, user_id, title, status, cards) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user.sub, body.title.trim(), body.status || 'active', cards).run();

  return json({ id }, 201);
}

async function handleGetDeck(deckId, user, env) {
  const row = await env.DB.prepare(
    'SELECT * FROM decks WHERE id = ? AND user_id = ?'
  ).bind(deckId, user.sub).first();

  if (!row) return json({ error: 'Not found' }, 404);

  return json({
    id: row.id,
    title: row.title,
    status: row.status,
    cards: JSON.parse(row.cards || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

async function handleUpdateDeck(request, deckId, user, env) {
  const existing = await env.DB.prepare(
    'SELECT id FROM decks WHERE id = ? AND user_id = ?'
  ).bind(deckId, user.sub).first();
  if (!existing) return json({ error: 'Not found' }, 404);

  const body = await request.json();
  const title = body.title !== undefined ? body.title : undefined;
  const status = body.status !== undefined ? body.status : undefined;
  const cards = body.cards !== undefined ? JSON.stringify(body.cards) : undefined;

  const sets = [];
  const vals = [];
  if (title !== undefined) { sets.push('title = ?'); vals.push(title); }
  if (status !== undefined) { sets.push('status = ?'); vals.push(status); }
  if (cards !== undefined) { sets.push('cards = ?'); vals.push(cards); }
  sets.push("updated_at = datetime('now')");
  vals.push(deckId, user.sub);

  await env.DB.prepare(
    `UPDATE decks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
  ).bind(...vals).run();

  return json({ ok: true });
}

async function handleDeleteDeck(deckId, user, env) {
  await env.DB.prepare(
    'DELETE FROM decks WHERE id = ? AND user_id = ?'
  ).bind(deckId, user.sub).run();
  return json({ ok: true });
}

// ---- Router ----

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      let response;

      // Auth routes (no auth required)
      if (path === '/api/memory/auth/login' && request.method === 'GET') {
        return handleLogin(request, env);
      }
      if (path === '/api/memory/auth/callback' && request.method === 'GET') {
        return handleCallback(request, env);
      }
      if (path === '/api/memory/auth/me' && request.method === 'GET') {
        response = await handleMe(request, env);
        return addCors(response, env);
      }
      if (path === '/api/memory/auth/logout' && request.method === 'POST') {
        response = handleLogout();
        return addCors(response, env);
      }

      // Protected routes — require auth
      const user = await getUser(request, env);
      if (!user) {
        response = json({ error: 'Unauthorized' }, 401);
        return addCors(response, env);
      }

      // Decks collection
      if (path === '/api/memory/decks') {
        if (request.method === 'GET') response = await handleListDecks(user, env);
        else if (request.method === 'POST') response = await handleCreateDeck(request, user, env);
      }

      // Single deck
      const deckMatch = path.match(/^\/api\/memory\/decks\/([a-f0-9-]+)$/);
      if (deckMatch) {
        const deckId = deckMatch[1];
        if (request.method === 'GET') response = await handleGetDeck(deckId, user, env);
        else if (request.method === 'PUT') response = await handleUpdateDeck(request, deckId, user, env);
        else if (request.method === 'DELETE') response = await handleDeleteDeck(deckId, user, env);
      }

      if (!response) response = json({ error: 'Not Found' }, 404);
      return addCors(response, env);
    } catch (err) {
      console.error(err);
      return addCors(json({ error: 'Internal Server Error' }, 500), env);
    }
  }
};
