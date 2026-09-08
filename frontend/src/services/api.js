const BASE_URL = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('token');
}

const isFormData = (o) => typeof FormData !== 'undefined' && o instanceof FormData;

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!isFormData(options.body)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.detail || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: (p, body) => request(p, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: (p) => request(p, { method: 'DELETE' }),
};