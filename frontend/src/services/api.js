import axios from 'axios';

const TOKEN_KEY = 'hostel_erp_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalise every failure into { message, code, status, details } so screens can show friendly text.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    let body = error.response?.data;
    if (body instanceof Blob) {
      try { body = JSON.parse(await body.text()); } catch { body = null; }
    }
    const normalized = {
      status,
      code: body?.code || (error.code === 'ECONNABORTED' ? 'TIMEOUT' : status ? 'ERROR' : 'NETWORK_ERROR'),
      message: body?.message || (status ? 'Something went wrong. Please try again.' : 'Cannot reach the server. Check your connection.'),
      details: body?.details,
    };
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: normalized.message }));
    }
    return Promise.reject(normalized);
  },
);

export async function download(url, params, fallbackName) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] || fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default api;
