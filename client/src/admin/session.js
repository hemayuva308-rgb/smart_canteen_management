import { makeApi } from '../shared/api.js';
import { createAuth } from '../shared/auth.jsx';

export const api = makeApi('tt_admin_token', () => { window.location.assign('/admin/login'); });
export const { Provider: AuthProvider, useAuth } = createAuth(api);
