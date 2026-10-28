import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Factory so the student and admin sites each get an isolated auth context.
export function createAuth(api) {
  const Ctx = createContext(null);
  function Provider({ children }) {
    const [user, setUser] = useState(null);
    const [ready, setReady] = useState(false);
    const refresh = useCallback(async () => {
      if (!api.token()) { setUser(null); setReady(true); return; }
      try { setUser((await api.get('/auth/me')).user); } catch { setUser(null); }
      setReady(true);
    }, []);
    useEffect(() => { refresh(); }, [refresh]);
    const signIn = (data) => { api.setToken(data.token); setUser(data.user); };
    const signOut = () => { api.clear(); setUser(null); };
    return <Ctx.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
  }
  return { Provider, useAuth: () => useContext(Ctx) };
}
