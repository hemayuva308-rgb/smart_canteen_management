// Thin fetch wrapper. Each app (student/admin) uses its own token key so sessions never mix.
const BASE = import.meta.env.VITE_API_URL || '/api';

export function makeApi(tokenKey, onUnauthorized) {
  const getToken = () => localStorage.getItem(tokenKey);
  async function request(method, path, body) {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && getToken()) { localStorage.removeItem(tokenKey); onUnauthorized?.(); }
      const err = new Error(data.error || 'Something went wrong');
      err.status = res.status; err.code = data.code; err.details = data.details;
      throw err;
    }
    return data;
  }
  // multipart upload (browser sets the boundary header itself)
  async function upload(path, formData) {
    let res;
    try { res = await fetch(`${BASE}${path}`, { method: 'POST', headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body: formData }); }
    catch { throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { status: 0 }); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || 'Something went wrong'); err.status = res.status; err.code = data.code; throw err; }
    return data;
  }
  return {
    upload,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b ?? {}),
    patch: (p, b) => request('PATCH', p, b ?? {}),
    put: (p, b) => request('PUT', p, b ?? {}),
    del: (p) => request('DELETE', p),
    token: getToken,
    setToken: (t) => localStorage.setItem(tokenKey, t),
    clear: () => localStorage.removeItem(tokenKey),
  };
}
