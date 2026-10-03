const TOKEN_KEY = 'xolt_token';

const localStorageOrNull = () => {
  try { return globalThis.localStorage || null; } catch { return null; }
};

export const getToken = () => {
  try { return localStorageOrNull()?.getItem(TOKEN_KEY) || null; } catch { return null; }
};

export const setToken = (token) => {
  try {
    if (token) localStorageOrNull()?.setItem(TOKEN_KEY, token);
  } catch { /* storage blocked; the HttpOnly cookie remains the fallback */ }
};

export const clearToken = () => {
  try { localStorageOrNull()?.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  // Legacy JavaScript cookie; the server clears its HttpOnly cookie via /auth/logout.
  try {
    globalThis.document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  } catch { /* document is unavailable outside the browser */ }
};

/**
 * Consume the JWT returned in the OAuth URL fragment before React mounts.
 * This ensures the AuthProvider's initial /auth/me request uses the new token
 * instead of racing an unauthenticated request against the callback page.
 */
export function captureOAuthTokenFromHash(browser = globalThis.window) {
  if (!browser?.location || !browser?.history) return null;

  const hash = browser.location.hash?.startsWith('#') ? browser.location.hash.slice(1) : '';
  if (!hash) return null;

  const token = new URLSearchParams(hash).get('token');
  if (!token) return null;

  setToken(token);
  browser.history.replaceState(
    browser.history.state ?? null,
    '',
    browser.location.pathname + browser.location.search,
  );
  return token;
}
