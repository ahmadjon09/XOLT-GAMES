import axios from 'axios';
import i18n from '../i18n/index.js';

export const TOKEN_KEY = 'xolt_token';

// --- Cookie helpers ---
const setCookie = (name, value, days = 7) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax`;
};

const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
};

const deleteCookie = (name) => {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

export const getToken = () => getCookie(TOKEN_KEY);
export const setToken = (t) => setCookie(TOKEN_KEY, t);
export const clearToken = () => deleteCookie(TOKEN_KEY);
// -------------------------

export const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
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

    if (status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
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