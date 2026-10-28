import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, useAuth } from '../session.js';
import { ErrorBox, Field } from '../../shared/ui.jsx';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = mode === 'login' ? { email: f.email, password: f.password } : { name: f.name, email: f.email, password: f.password, ...(f.phone ? { phone: f.phone } : {}) };
      const data = await api.post(mode === 'login' ? '/auth/login' : '/auth/register', body);
      signIn(data);
      nav(loc.state?.from || '/', { replace: true });
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand p-10 text-white md:flex">
        <p className="font-display text-2xl font-extrabold">TAP &amp; TAKE</p>
        <div>
          <h1 className="font-display text-5xl font-extrabold leading-[1.05]">Order Smart.<br />Pick Up Fast.</h1>
          <p className="mt-4 max-w-sm text-white/90">Pre-order from your seat, get a token and QR, and pick up without the queue.</p>
        </div>
        <img src="/food/thali.svg" alt="" className="w-56 rounded-3xl" />
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4" noValidate>
          <h2 className="text-3xl font-extrabold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="text-sm text-black/60 md:hidden">Order Smart. Pick Up Fast.</p>
          {mode === 'register' && <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} autoComplete="name" required /></Field>}
          <Field label="College email"><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
          {mode === 'register' && <Field label="Mobile number (optional)" hint="Used only for pickup reminders. Never shown to other students."><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="9876543210" /></Field>}
          <Field label="Password" hint={mode === 'register' ? 'At least 8 characters with a letter and a number' : undefined}><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></Field>
          <ErrorBox error={err} />
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <p className="text-center text-sm">
            {mode === 'login' ? 'New here? ' : 'Already registered? '}
            <button type="button" className="font-semibold text-brand underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(null); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
          </p>
          <p className="text-center text-xs text-black/50">Canteen staff sign in at <a className="underline" href="/admin">/admin</a>.</p>
        </form>
      </section>
    </div>
  );
}
