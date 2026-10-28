import { useState } from 'react';
import { api, useAuth } from '../session.js';
import { ErrorBox, Field, useToast, Toast } from '../../shared/ui.jsx';

export default function Profile() {
  const { user, refresh, signOut } = useAuth();
  const [f, setF] = useState({ name: user.name, phone: user.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [err, setErr] = useState(null);
  const [err2, setErr2] = useState(null);
  const [toast, show] = useToast();

  async function save(e) {
    e.preventDefault(); setErr(null);
    try { await api.patch('/auth/me', { name: f.name, ...(f.phone ? { phone: f.phone } : {}) }); await refresh(); show('Profile saved'); } catch (x) { setErr(x); }
  }
  async function changePw(e) {
    e.preventDefault(); setErr2(null);
    try { await api.post('/auth/change-password', pw); setPw({ currentPassword: '', newPassword: '' }); show('Password changed'); } catch (x) { setErr2(x); }
  }
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-extrabold">Your profile</h1>
      <form onSubmit={save} className="card space-y-4 p-5">
        <p className="text-sm text-black/60">{user.email}. Your phone number is private.</p>
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mobile number"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="9876543210" /></Field>
        <ErrorBox error={err} />
        <button className="btn btn-primary">Save changes</button>
      </form>
      <form onSubmit={changePw} className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Change password</h2>
        <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
        <Field label="New password" hint="At least 8 characters with a letter and a number"><input className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        <ErrorBox error={err2} />
        <button className="btn btn-ghost">Update password</button>
      </form>
      <button className="btn btn-ghost w-full" onClick={signOut}>Sign out</button>
      <Toast toast={toast} />
    </div>
  );
}
