

import { http, errorMessage, getToken, setToken, clearToken } from './http.js';


const unwrap = (res) => res.data;

export const Fetch = {
  get: async (url) => {
    const res = await http.get(url);
    return unwrap(res);
  },
  getMeta: async (url) => {
    const res = await http.get(url);
    return { data: res.data, meta: res.meta };
  },
  post: async (url, body) => {
    const res = await http.post(url, body);
    return unwrap(res);
  },
  patch: async (url, body) => {
    const res = await http.patch(url, body);
    return unwrap(res);
  },
  put: async (url, body) => {
    const res = await http.put(url, body);
    return unwrap(res);
  },
  del: async (url) => {
    const res = await http.delete(url);
    return unwrap(res);
  },
  
  upload: async (url, formData) => {
    const res = await http.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return unwrap(res);
  },
};

export { errorMessage, getToken, setToken, clearToken };
