import { useState } from 'react';
import { api } from '../session.js';
import { Badge, Empty, ErrorBox, Spinner, usePolling, useToast, Toast } from '../../shared/ui.jsx';
import { fmtTime, rupee } from '../../shared/format.js';

// PLACED means "not paid yet": the order is confirmed automatically (and gets its token) when payment is confirmed.
const NEXT = { CONFIRMED: ['PREPARING', 'Start preparing'], PREPARING: ['READY', 'Mark ready'] };

export default function Orders() {
  const [scope, setScope] = useState('active');
  const orders = usePolling(() => api.get(`/admin/orders?scope=${scope}`), 8000, [scope]);
  const agg = usePolling(() => api.get('/admin/orders/aggregate'), 8000, []);
  const [err, setErr] = useState(null);
  const [toast, show] = useToast();
  const act = async (fn, msg) => { setErr(null); try { await fn(); show(msg); orders.reload(); agg.reload(); } catch (e) { setErr(e); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-3xl font-extrabold">Live orders</h1>
        <div className="flex gap-2">{[['active', 'Active'], ['today', 'Today (all)']].map(([v, l]) => <button key={v} className={`btn btn-sm ${scope === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setScope(v)}>{l}</button>)}</div></div>
      <ErrorBox error={err || orders.error} />
      <section className="card p-4" aria-label="Quantities to prepare">
        <h2 className="mb-2 text-lg font-bold">To prepare now</h2>
        {!agg.data?.items.length ? <p className="text-sm text-black/60">Nothing waiting. New orders will add up here.</p> : (
          <ul className="flex flex-wrap gap-2">{agg.data.items.map((i) => <li key={i.name} className="rounded-xl bg-brand-soft px-3 py-2"><span className="font-display text-2xl font-extrabold text-brand">{i.quantity}×</span> <span className="font-semibold">{i.name}</span> <span className="text-xs text-black/50">in {i.orders} order{i.orders > 1 ? 's' : ''}</span></li>)}</ul>
        )}
      </section>
      {orders.loading && !orders.data && <Spinner />}
      {orders.data && !orders.data.orders.length && <Empty title="No orders here" hint="New student orders appear automatically." />}
      <ul className="grid gap-3 lg:grid-cols-2">
        {orders.data?.orders.map((o) => (
          <li key={o._id} className="card p-4">
            <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{o.tokenNumber ? <span className="mr-1 rounded-lg bg-ink px-2 py-0.5 font-display text-white">#{o.tokenNumber}</span> : <span className="mr-1 text-black/50">No token</span>}{o.orderNumber} <span className="font-normal text-black/50">· {fmtTime(o.createdAt)}</span></p><p className="text-sm text-black/60">{o.studentName}</p></div><div className="flex flex-wrap justify-end gap-1"><Badge value={o.status} /><Badge value={o.paymentStatus} label={`${o.paymentMethod.replace(/_/g, ' ').toLowerCase()} · ${o.paymentStatus.toLowerCase()}`} /></div></div>
            <ul className="mt-2 text-sm">{o.items.map((i) => <li key={i.menuItem}><b>{i.quantity}×</b> {i.name}</li>)}</ul>
            {o.note && <p className="mt-1 rounded-lg bg-amber-50 p-2 text-sm">Note: {o.note}</p>}
            <p className="mt-2 text-sm text-black/60">{rupee(o.total)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {NEXT[o.status] && <button className="btn btn-primary btn-sm" onClick={() => act(() => api.patch(`/admin/orders/${o._id}/status`, { status: NEXT[o.status][0] }), `Order ${NEXT[o.status][1].toLowerCase()}`)}>{NEXT[o.status][1]}</button>}
              {o.paymentMethod === 'CASH_ON_PICKUP' && o.paymentStatus !== 'PAID' && !['CANCELLED', 'COLLECTED'].includes(o.status) && <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.post(`/admin/orders/${o._id}/cash-received`), 'Cash recorded')}>Confirm cash received</button>}
              {['PLACED', 'CONFIRMED', 'PREPARING', 'READY'].includes(o.status) && <button className="btn btn-ghost btn-sm" onClick={() => window.confirm(`Cancel ${o.orderNumber}?`) && act(() => api.post(`/admin/orders/${o._id}/cancel`, { reason: 'Cancelled by canteen' }), 'Order cancelled')}>Cancel</button>}
            </div>
            {o.refundRequired && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">Paid order cancelled: arrange a manual refund. Nothing was refunded automatically.</p>}
          </li>
        ))}
      </ul>
      <Toast toast={toast} />
    </div>
  );
}
