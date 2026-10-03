import axios from 'axios';
import i18n from '../i18n/index.js';
import { api } from './api.js';

const TOKEN_KEY = 'xolt_token';

// The auth cookie is HttpOnly and managed by the server. This only clears any legacy JS cookie.
const deleteCookie = (name) => {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

export const clearToken = () => deleteCookie(TOKEN_KEY);
// -------------------------

export const http = axios.create({
  baseURL: `${api}/api`,
  timeout: 20000,
  withCredentials: true,
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