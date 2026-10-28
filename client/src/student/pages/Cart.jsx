import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../session.js';
import { useCart } from '../cart.jsx';
import { Empty, ErrorBox, FoodImage } from '../../shared/ui.jsx';
import { rupee } from '../../shared/format.js';

export default function Cart() {
  const { lines, setQty, clear, total } = useCart();
  const nav = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [method, setMethod] = useState('CASH_ON_PICKUP');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/config').then(setCfg).catch(() => {}); }, []);
  useEffect(() => { if (cfg && !cfg.demoPaymentsEnabled && method === 'DEMO') setMethod('CASH_ON_PICKUP'); }, [cfg, method]);

  async function place() {
    setBusy(true); setErr(null);
    try {
      const { order } = await api.post('/orders', {
        items: lines.map((l) => ({ menuItemId: l.id, quantity: l.qty })),
        paymentMethod: method, ...(note.trim() ? { note: note.trim() } : {}),
      });
      clear();
      nav(`/orders/${order._id}`, { state: { justPlaced: true } });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  if (!lines.length) return <Empty title="Your cart is empty" hint="Pick something from the menu and it will show up here."><Link to="/" className="btn btn-primary">Browse the menu</Link></Empty>;

  const opt = (value, title, sub, disabled) => (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${method === value ? 'border-brand bg-brand-soft' : 'border-black/10 bg-white'} ${disabled ? 'opacity-50' : ''}`}>
      <input type="radio" name="pay" className="mt-1 accent-[#E53935]" checked={method === value} disabled={disabled} onChange={() => setMethod(value)} />
      <span><span className="block font-semibold">{title}</span><span className="block text-sm text-black/60">{sub}</span></span>
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <h1 className="mb-3 text-3xl font-extrabold">Your cart</h1>
        <ul className="card divide-y divide-black/5">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 p-3">
              <FoodImage src={l.imageUrl} alt="" className="h-16 w-16 rounded-xl" />
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{l.name}</p><p className="text-sm text-black/60">{rupee(l.price)} each</p></div>
              <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${l.name}`}>
                <button className="btn btn-ghost btn-sm !min-h-9 w-9" onClick={() => setQty(l.id, l.qty - 1)} aria-label="Decrease">−</button>
                <span className="w-7 text-center font-bold" aria-live="polite">{l.qty}</span>
                <button className="btn btn-ghost btn-sm !min-h-9 w-9" onClick={() => setQty(l.id, l.qty + 1)} disabled={l.qty >= 10} aria-label="Increase">+</button>
              </div>
              <p className="w-16 text-right font-bold">{rupee(l.price * l.qty)}</p>
            </li>
          ))}
        </ul>
        <label className="mt-4 block"><span className="label">Note for the kitchen (optional)</span><input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Less spicy, no onion…" /></label>
      </section>

      <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-24">
        <h2 className="text-xl font-bold">Checkout</h2>
        <fieldset className="space-y-2"><legend className="label">Payment</legend>
            {opt('CASH_ON_PICKUP', 'Cash on pickup', 'Pay at the counter. Your token is issued once staff confirm your cash.')}
            {cfg?.demoPaymentsEnabled && opt('DEMO', 'Demo payment', 'Practice checkout. No real money is charged.')}
            {opt('ONLINE', 'Pay online (UPI / card)', cfg?.onlinePaymentsEnabled ? 'Secure checkout by the payment provider.' : 'Not set up on this canteen yet.', !cfg?.onlinePaymentsEnabled)}
        </fieldset>
        <dl className="space-y-1 border-t border-black/10 pt-3 text-sm">
          <div className="flex justify-between"><dt>Items</dt><dd>{rupee(total)}</dd></div>
          <div className="flex justify-between text-lg font-extrabold"><dt>To pay</dt><dd>{rupee(total)}</dd></div>
        </dl>
        <p className="text-xs text-black/50">The final price is confirmed by the server when you place the order.</p>
        <ErrorBox error={err} />
        <button className="btn btn-primary w-full" onClick={place} disabled={busy}>{busy ? 'Placing order…' : 'Place order'}</button>
      </aside>
    </div>
  );
}
