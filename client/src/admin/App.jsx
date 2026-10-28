import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, useAuth } from './session.js';
import { ErrorBox, Field, Spinner } from '../shared/ui.jsx';
import Overview from './pages/Overview.jsx';
import Orders from './pages/Orders.jsx';
import Pickup from './pages/Pickup.jsx';
import Scan from './pages/Scan.jsx';
import PrepList from './pages/PrepList.jsx';
import MenuAdmin from './pages/MenuAdmin.jsx';
import Payments from './pages/Payments.jsx';
import Reports from './pages/Reports.jsx';

function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { signIn(await api.post('/auth/admin/login', f)); nav('/', { replace: true }); } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-ink p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6">
        <div><p className="font-display text-2xl font-extrabold">TAP <span className="text-brand">&amp;</span> TAKE</p><h1 className="text-lg font-bold">Canteen staff sign-in</h1></div>
        <Field label="Email"><input className="input" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <ErrorBox error={err} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-xs text-black/50">Staff accounts are created by the canteen owner. Students sign in on the main site.</p>
      </form>
    </div>
  );
}

const links = [['/', 'Overview'], ['/orders', 'Live orders'], ['/scan', 'Scan QR'], ['/pickup', 'Pickup desk'], ['/prep', 'Prep list'], ['/menu', 'Menu'], ['/payments', 'Payments'], ['/reports', 'Reports']];

function Layout({ children }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const cls = ({ isActive }) => `block rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-brand text-white' : 'text-white/80 hover:bg-white/10'}`;
  const nav = (
    <nav className="space-y-1" aria-label="Admin" onClick={() => setOpen(false)}>
      {links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={cls}>{label}</NavLink>)}
    </nav>
  );
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-ink p-4 md:flex">
        <div><p className="mb-6 px-3 font-display text-xl font-extrabold text-white">TAP <span className="text-brand">&amp;</span> TAKE <span className="ml-1 text-xs font-semibold text-white/50">staff</span></p>{nav}</div>
        <div className="px-3 text-sm text-white/70"><p className="truncate">{user.name}</p><button className="mt-1 font-semibold text-white underline" onClick={signOut}>Sign out</button></div>
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-white md:hidden">
        <p className="font-display text-lg font-extrabold">TAP <span className="text-brand">&amp;</span> TAKE staff</p>
        <button className="btn btn-sm bg-white/10 text-white" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
      </header>
      {open && <div className="bg-ink p-3 md:hidden">{nav}<button className="mt-3 px-3 text-sm font-semibold text-white underline" onClick={signOut}>Sign out</button></div>}
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner label="Starting" />;
  if (!user || user.role !== 'ADMIN') return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/pickup" element={<Pickup />} />
        <Route path="/prep" element={<PrepList />} />
        <Route path="/menu" element={<MenuAdmin />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
