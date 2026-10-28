import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useAuth } from '../session.js';
import { useCart } from '../cart.jsx';
import { Empty, ErrorBox, FoodImage, Spinner, usePolling } from '../../shared/ui.jsx';
import { rupee, pretty } from '../../shared/format.js';

function ActiveTicket() {
  const { data } = usePolling(() => api.get('/orders'), 10000, []);
  const active = data?.orders?.find((o) => ['PLACED', 'CONFIRMED', 'PREPARING', 'READY'].includes(o.status));
  if (!active) return null;
  return (
    <Link to={`/orders/${active._id}`} className="card block min-w-64 border-dashed p-4 md:max-w-xs" aria-label="Open your active order">
      <p className="text-sm font-semibold text-black/60">Your order {active.orderNumber}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{pretty(active.status)}</p>
      {active.status === 'READY' ? <p className="mt-2 rounded-lg bg-eco px-3 py-2 text-center font-display text-2xl font-extrabold text-eco-deep">Token {active.token} is ready</p> : <p className="mt-2 text-sm text-black/60">Open it to see your token, QR and queue position.</p>}
    </Link>
  );
}

export default function Menu({ publicView }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { add, lines } = useCart();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const load = () => { setErr(null); api.get('/menu').then(setData).catch(setErr); };
  useEffect(() => { load(); }, []);

  const items = useMemo(() => (data?.items || []).filter((i) => (!cat || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase()))), [data, q, cat]);
  const grouped = useMemo(() => items.reduce((m, i) => ((m[i.category] ||= []).push(i), m), {}), [items]);
  const qtyOf = (id) => lines.find((l) => l.id === id)?.qty || 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-3xl bg-white p-6 shadow-card md:flex-row md:items-center md:justify-between md:p-8">
        <div className="max-w-xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] md:text-5xl">Order Smart.<br />Pick Up Fast.</h1>
          <p className="mt-3 text-black/70">Browse the menu, pre-order, get a token and QR, and collect without standing in the queue.</p>
        </div>
        {user && !publicView && <ActiveTicket />}
      </section>

      <div className="sticky top-[60px] z-20 -mx-4 space-y-3 bg-blush/95 px-4 py-2 backdrop-blur">
        <input className="input" type="search" placeholder="Search dishes" aria-label="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
          {['', ...(data?.categories || [])].map((c) => (
            <button key={c || 'all'} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`chip shrink-0 !px-4 !py-2 text-sm ${cat === c ? 'bg-brand text-white' : 'bg-white text-ink border border-black/10'}`}>{c || 'All'}</button>
          ))}
        </div>
      </div>

      <ErrorBox error={err} onRetry={load} />
      {!data && !err && <Spinner label="Loading menu" />}
      {data && items.length === 0 && <Empty title="No dishes match" hint="Try a different word or pick another category."><button className="btn btn-ghost" onClick={() => { setQ(''); setCat(''); }}>Clear filters</button></Empty>}

      {Object.entries(grouped).map(([category, list]) => (
        <section key={category} aria-labelledby={`c-${category}`}>
          <h2 id={`c-${category}`} className="mb-3 text-2xl font-bold">{category}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((i) => (
              <article key={i._id} className={`card overflow-hidden ${i.isAvailable ? '' : 'opacity-70'}`}>
                <div className="relative">
                  <FoodImage src={i.imageUrl} alt={i.name} className="h-44 w-full" />
                  <span className={`absolute left-3 top-3 grid h-5 w-5 place-items-center rounded border-2 bg-white ${i.isVeg ? 'border-green-600' : 'border-red-700'}`} title={i.isVeg ? 'Vegetarian' : 'Non-vegetarian'}><span className={`h-2.5 w-2.5 rounded-full ${i.isVeg ? 'bg-green-600' : 'bg-red-700'}`} /></span>
                  {!i.isAvailable && <span className="absolute inset-0 grid place-items-center bg-white/70 font-bold">Not available right now</span>}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3"><h3 className="text-lg font-bold">{i.name}</h3><p className="font-display text-lg font-extrabold text-brand">{rupee(i.price)}</p></div>
                  <p className="mt-1 min-h-10 text-sm text-black/60">{i.description}</p>
                  <button className="btn btn-primary mt-3 w-full" disabled={!i.isAvailable} onClick={() => (user ? add(i) : nav('/login'))}>
                    {!user ? 'Sign in to order' : qtyOf(i._id) ? `Add another (${qtyOf(i._id)} in cart)` : 'Add to cart'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
