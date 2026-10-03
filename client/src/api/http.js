import axios from 'axios';
import i18n from '../i18n/index.js';
import { api } from './api.js';

const TOKEN_KEY = 'xolt_token';

// Token OAuth callback'da URL fragment (#token=...) orqali keladi va shu yerda
// localStorage'da saqlanadi. Har bir so'rovga Authorization: Bearer qo'shiladi —
// shuning uchun cookie ham, dev proxy ham shart emas (API cross-origin bo'lsa ham ishlaydi).
export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
  } catch { /* storage bloklangan (private mode) — cookie fallback ishlaydi */ }
};

const deleteCookie = (name) => {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  // Legacy JS cookie'ni ham tozalaymiz (HttpOnly cookie'ni server /auth/logout tozalaydi).
  deleteCookie(TOKEN_KEY);
};
// -------------------------

export const http = axios.create({
  baseURL: `${api}/api`,
  timeout: 20000,
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && body.success) {
      return { ...res, data: body.data, meta: body.meta || null };
    }
    const err = new Error(body?.error?.message || i18n.t('errors.generic'));
    err.code = body?.error?.code || 'UNKNOWN';
    err.status = res.status;
    throw err;
  },
  (error) => {
    const status = error.response?.status;
    const body = error.response?.data;
    const err = new Error(body?.error?.message || i18n.t('errors.generic'));
    err.code = body?.error?.code || (error.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK');
    err.status = status;

    if (status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent('xolt:unauthorized'));
    }
    throw err;
  }
);

export const errorMessage = (err) => {
  const code = err?.code;
  if (code && i18n.exists(`errors.${code}`)) return i18n.t(`errors.${code}`);
  return err?.message || i18n.t('errors.generic');
};