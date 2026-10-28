import { makeApi } from '../shared/api.js';
import { createAuth } from '../shared/auth.jsx';

export const api = makeApi('tt_student_token', () => { window.location.assign('/login'); });
export const { Provider: AuthProvider, useAuth } = createAuth(api);
