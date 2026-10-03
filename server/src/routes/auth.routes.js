// Public account authentication: GitHub/Google OAuth for players; admin access is allowlisted by verified email.
import { Router } from 'express';
import crypto from 'node:crypto';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { signToken } from '../utils/security.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { prisma } from '../prisma/client.js';
import { env } from '../config/env.js';

const router = Router();
const OAUTH_STATE_COOKIE = 'xolt_oauth_state';
const AUTH_COOKIE = 'xolt_token';
const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const userProfile = (user) => ({
  id: user.id,
  kind: 'user',
  full_name: user.full_name,
  avatar: user.avatar,
  coverImage: user.coverImage,
  email: user.email,
  phone: user.phone,
  username: user.username,
  coin: user.coin,
  score: user.score,
  week_score: user.week_score,
  month_score: user.month_score,
  currentFrame: user.currentFrame || null,
  currentEffect: user.currentEffect || null,
  createdAt: user.createdAt,
});

const staffProfile = (staff) => ({
  id: staff.id,
  kind: 'staff',
  full_name: staff.full_name,
  avatar: staff.avatar,
  email: staff.email || null,
  phone: staff.phone || null,
  role: staff.role,
  createdAt: staff.createdAt,
});

const providerConfig = (provider) => {
  if (provider === 'github') {
    return {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    };
  }
  if (provider === 'google') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  throw new ApiError(404, 'OAUTH_PROVIDER_NOT_FOUND', 'OAuth provider topilmadi');
};

const redirectUriFor = (provider) =>
  `${env.oauthRedirectBaseUrl.replace(/\/+$/, '')}/api/auth/oauth/${provider}/callback`;

const cookieOptions = (maxAge, path = '/') => ({
  httpOnly: true,
  secure: env.isProduction || env.cookieSameSite === 'none',
  sameSite: env.cookieSameSite,
  maxAge,
  path,
});

const authFailureRedirect = (res, reason = 'oauth_failed') => {
  const base = env.frontendUrl.replace(/\/+$/, '');
  return res.redirect(`${base}/login?auth_error=${encodeURIComponent(reason)}`);
};

async function requestProviderProfile(provider, code, config, redirectUri) {
  if (provider === 'github') {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error('GITHUB_TOKEN_EXCHANGE_FAILED');

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const userResponse = await fetch('https://api.github.com/user', { headers, signal: AbortSignal.timeout(12_000) });
    if (!userResponse.ok) throw new Error('GITHUB_PROFILE_FAILED');
    const githubUser = await userResponse.json();

    let email = null;
    const emailResponse = await fetch('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(12_000) });
    if (emailResponse.ok) {
      const emails = await emailResponse.json();
      email = emails.find((entry) => entry.primary && entry.verified)?.email || null;
    }
    return {
      id: String(githubUser.id),
      name: githubUser.name || githubUser.login || 'GitHub player',
      username: githubUser.login,
      avatar: githubUser.avatar_url || null,
      email: email ? email.toLowerCase() : null,
      verifiedEmail: Boolean(email),
    };
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error('GOOGLE_TOKEN_EXCHANGE_FAILED');

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!profileResponse.ok) throw new Error('GOOGLE_PROFILE_FAILED');
  const googleUser = await profileResponse.json();
  const verifiedEmail = googleUser.email_verified === true || googleUser.email_verified === 'true';
  return {
    id: String(googleUser.sub),
    name: googleUser.name || googleUser.email?.split('@')[0] || 'Google player',
    username: googleUser.email?.split('@')[0],
    avatar: googleUser.picture || null,
    email: verifiedEmail && googleUser.email ? String(googleUser.email).toLowerCase() : null,
    verifiedEmail,
  };
}

function normalizeUsername(value) {
  const cleaned = String(value || 'player')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  return cleaned || 'player';
}

async function makeUniqueUsername(value) {
  const base = normalizeUsername(value);
  let candidate = base;
  let suffix = 2;
  while (await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } })) {
    const tail = `_${suffix++}`;
    candidate = `${base.slice(0, 20 - tail.length)}${tail}`;
  }
  return candidate;
}

async function getOrCreateOAuthPrincipal(provider, profile) {
  const providerAccountId = String(profile.id);
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: true, staff: true },
  });
  if (existing?.staff) {
    if (!existing.staff.active) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Admin hisobi faolsizlantirilgan');
    return { kind: 'staff', record: existing.staff };
  }
  if (existing?.user) {
    const update = {};
    if (profile.avatar && profile.avatar !== existing.user.avatar) update.avatar = profile.avatar;
    if (!existing.user.email && profile.email) update.email = profile.email;
    const user = Object.keys(update).length
      ? await prisma.user.update({ where: { id: existing.user.id }, data: update })
      : existing.user;
    return { kind: 'user', record: user };
  }

  const adminEmails = new Set(
    String(process.env.ADMIN_OAUTH_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  if (profile.verifiedEmail && profile.email && adminEmails.has(profile.email)) {
    const staff = await prisma.staff.upsert({
      where: { email: profile.email },
      update: { full_name: profile.name, role: 'ADMIN', active: true },
      create: {
        full_name: profile.name,
        email: profile.email,
        phone: null,
        password: null,
        role: 'ADMIN',
        active: true,
      },
    });
    await prisma.oAuthAccount.create({
      data: { provider, providerAccountId, email: profile.email, staffId: staff.id },
    });
    return { kind: 'staff', record: staff };
  }

  // Provisioned admin accounts can sign in with their verified Google/GitHub email.
  if (profile.verifiedEmail && profile.email) {
    const staff = await prisma.staff.findUnique({ where: { email: profile.email } });
    if (staff) {
      if (!staff.active) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Xodim hisobi faolsizlantirilgan');
      await prisma.oAuthAccount.create({
        data: { provider, providerAccountId, email: profile.email, staffId: staff.id },
      });
      return { kind: 'staff', record: staff };
    }
  }

  // Link the second provider to an existing player when it returns the same verified email.
  // This avoids duplicate profiles when someone starts with Google and later uses GitHub (or vice versa).
  if (profile.verifiedEmail && profile.email) {
    const matchingUser = await prisma.user.findFirst({
      where: { email: { equals: profile.email, mode: 'insensitive' } },
    });
    if (matchingUser) {
      await prisma.oAuthAccount.create({
        data: { provider, providerAccountId, email: profile.email, userId: matchingUser.id },
      });
      const update = {};
      if (!matchingUser.email) update.email = profile.email;
      if (profile.avatar && !matchingUser.avatar) update.avatar = profile.avatar;
      const user = Object.keys(update).length
        ? await prisma.user.update({ where: { id: matchingUser.id }, data: update })
        : matchingUser;
      return { kind: 'user', record: user };
    }
  }

  const username = await makeUniqueUsername(profile.username || profile.email?.split('@')[0] || profile.name);
  const user = await prisma.user.create({
    data: {
      full_name: String(profile.name || 'XOLT Player').trim().slice(0, 60) || 'XOLT Player',
      avatar: profile.avatar,
      email: profile.email,
      phone: null,
      password: null,
      username,
      coin: 100,
      oauthAccounts: {
        create: { provider, providerAccountId, email: profile.email },
      },
    },
  });
  return { kind: 'user', record: user };
}

// Public accounts must be created by a verified GitHub or Google OAuth provider.
router.post('/register', authLimiter, asyncH(async (_req, _res) => {
  throw new ApiError(410, 'OAUTH_REQUIRED', 'Ro\'yxatdan o\'tish uchun GitHub yoki Google orqali kiring');
}));

router.get('/providers', (_req, res) => {
  return ok(res, {
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
});

router.get('/oauth/:provider', authLimiter, asyncH(async (req, res) => {
  const provider = String(req.params.provider).toLowerCase();
  const config = providerConfig(provider);
  if (!config.clientId || !config.clientSecret) {
    throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', `${provider} OAuth hali sozlanmagan`);
  }

  const state = crypto.randomBytes(32).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions(10 * 60 * 1000, '/api/auth/oauth'));
  const redirectUri = redirectUriFor(provider);
  const authorizeUrl = new URL(provider === 'github'
    ? 'https://github.com/login/oauth/authorize'
    : 'https://accounts.google.com/o/oauth2/v2/auth');
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('state', state);
  if (provider === 'github') {
    authorizeUrl.searchParams.set('scope', 'read:user user:email');
  } else {
    authorizeUrl.searchParams.set('scope', 'openid email profile');
    authorizeUrl.searchParams.set('prompt', 'select_account');
  }
  return res.redirect(authorizeUrl.toString());
}));

router.get('/oauth/:provider/callback', authLimiter, asyncH(async (req, res) => {
  const provider = String(req.params.provider).toLowerCase();
  const config = providerConfig(provider);
  const expectedState = String(req.cookies?.[OAUTH_STATE_COOKIE] || readCookie(req.headers.cookie, OAUTH_STATE_COOKIE) || '');
  const receivedState = String(req.query.state || '');
  res.clearCookie(OAUTH_STATE_COOKIE, cookieOptions(0, '/api/auth/oauth'));

  if (req.query.error) return authFailureRedirect(res, 'oauth_cancelled');
  if (!req.query.code || !expectedState || !receivedState || expectedState !== receivedState) {
    return authFailureRedirect(res, 'oauth_state_invalid');
  }
  if (!config.clientId || !config.clientSecret) return authFailureRedirect(res, 'oauth_not_configured');

  try {
    const profile = await requestProviderProfile(provider, String(req.query.code), config, redirectUriFor(provider));
    if (!profile.id) throw new Error('OAUTH_PROFILE_ID_MISSING');
    const principal = await getOrCreateOAuthPrincipal(provider, profile);
    const token = principal.kind === 'staff'
      ? signToken({ id: principal.record.id, kind: 'staff', role: principal.record.role, full_name: principal.record.full_name })
      : signToken({ id: principal.record.id, kind: 'user', full_name: principal.record.full_name });
    res.cookie(AUTH_COOKIE, token, cookieOptions(AUTH_COOKIE_MAX_AGE));
    return res.redirect(`${env.frontendUrl.replace(/\/+$/, '')}/auth/callback`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return authFailureRedirect(res, 'account_disabled');
    console.error(`[auth] ${provider} OAuth callback failed:`, error?.message || error);
    return authFailureRedirect(res, 'oauth_failed');
  }
}));

function readCookie(cookieHeader, name) {
  const item = String(cookieHeader || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return null;
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return null; }
}

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions(0));
  return ok(res, { message: 'Hisobdan chiqildi' });
});

// GET /api/auth/me — current OAuth player or staff account.
router.get('/me', requireAuth('any'), asyncH(async (req, res) => {
  const { kind, id } = req.user;
  if (kind === 'staff') {
    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new ApiError(404, 'NOT_FOUND', 'Admin topilmadi');
    return ok(res, staffProfile(staff));
  }
  const user = await prisma.user.findUnique({
    where: { id },
    include: { currentFrame: true, currentEffect: true },
  });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
  return ok(res, userProfile(user));
}));

export default router;
