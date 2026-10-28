import { useState } from 'react';
import QrPass from '../QrPass.jsx';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../session.js';
import { Badge, ErrorBox, Modal, Spinner, usePolling, useToast, Toast } from '../../shared/ui.jsx';
import { fmtDateTime, ORDER_STEPS, pretty, rupee } from '../../shared/format.js';

function DemoPay({ order, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (outcome) => {
    setBusy(true); setErr(null);
    try {
      const { sessionId } = await api.post(`/orders/${order._id}/payment/initiate`);
      await api.post(`/orders/${order._id}/payment/demo-confirm`, { sessionId, outcome });
      onDone(outcome); onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal title="Demo payment" onClose={onClose}>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><b>This is a demo.</b> No real money is charged and no bank or UPI app is involved. The server records the result as a demo payment.</p>
      <p className="my-4 text-center font-display text-3xl font-extrabold">{rupee(order.amountDue)}</p>
      <ErrorBox error={err} />
      <div className="mt-3 grid gap-2"><button className="btn btn-green" disabled={busy} onClick={() => go('success')}>Simulate successful payment</button><button className="btn btn-ghost" disabled={busy} onClick={() => go('fail')}>Simulate failed payment</button></div>
    </Modal>
  );
}

async function payOnline(order, onDone, setErr) {
  try {
    const init = await api.post(`/orders/${order._id}/payment/initiate`);
    await new Promise((res, rej) => { if (window.Razorpay) return res(); const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window')); document.body.appendChild(s); });
    new window.Razorpay({
      key: init.keyId, order_id: init.providerOrderId, amount: init.amount * 100, currency: 'INR', name: 'TAP & TAKE',
      handler: async (r) => { try { await api.post(`/orders/${order._id}/payment/verify`, r); onDone('success'); } catch (e) { setErr(e); } },
    }).open();
  } catch (e) { setErr(e); }
}


function QueueStrip({ orderId }) {
  const { data } = usePolling(() => api.get('/queue'), 8000, []);
  if (!data) return null;
  const mine = data.mine.find((m) => m.orderId === orderId);
  return (
    <section className="no-print card p-4" aria-label="Pickup queue">
      <h2 className="mb-2 font-bold">Pickup queue</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-black/60">Ready now</p><p className="font-display text-xl font-extrabold text-eco-deep">{data.ready.length ? data.ready.map((t) => `#${t}`).join('  ') : '–'}</p></div>
        <div><p className="text-black/60">Being prepared</p><p className="font-display text-xl font-extrabold">{data.preparing.length ? data.preparing.slice(0, 8).map((t) => `#${t}`).join('  ') : '–'}</p></div>
      </div>
      {mine && mine.status !== 'READY' && <p className="mt-2 text-sm">{mine.ahead === 0 ? 'You are next in line.' : `${mine.ahead} order${mine.ahead > 1 ? 's' : ''} ahead of you.`}</p>}
    </section>
  );
}

// Shown when the order is ready. Collecting happens only at the counter: staff scan the QR below, so nothing to type or press here.
function ReadyBanner({ order }) {
  return (
    <div className="no-print card space-y-1 border-eco-deep bg-eco p-5">
      <p className="font-display text-lg font-extrabold text-eco-deep">Your order is ready: Token {order.token}</p>
      <p className="text-sm text-eco-deep">Go to the counter and show the QR below. Staff scan it once, hand you your food, and the order closes.</p>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const loc = useLocation();
  const { data, error, loading, reload } = usePolling(() => api.get(`/orders/${id}`), 8000, [id]);
  const [demo, setDemo] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, show] = useToast();

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const { order, payment, pickup } = data;
  const idx = ORDER_STEPS.indexOf(order.status);
  const cancelled = order.status === 'CANCELLED';
  const needsPay = ['DEMO', 'ONLINE'].includes(order.paymentMethod) && ['UNPAID', 'FAILED'].includes(order.paymentStatus) && !cancelled;
  const active = pickup.isActive;

  async function cancel() {
    setErr(null);
    try { await api.post(`/orders/${id}/cancel`); show('Order cancelled'); reload(); } catch (e) { setErr(e); }
  }
  const done = (o) => { show(o === 'success' ? 'Payment recorded' : 'Payment failed. You can try again.', o === 'success' ? 'ok' : 'error'); reload(); };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/orders" className="no-print text-sm font-semibold text-brand">← All orders</Link>
      {loc.state?.justPlaced && <p className="no-print rounded-xl bg-eco p-3 text-sm font-semibold text-eco-deep">Order placed. {needsPay ? 'Complete payment below so the kitchen can start.' : 'The kitchen will confirm it shortly.'}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-3xl font-extrabold">{order.token ? `Token ${order.token}` : order.orderNumber}</h1><div className="flex gap-2"><Badge value={order.status} /><Badge value={order.paymentStatus} /></div></div>

      {!cancelled && (
        <ol className="no-print card flex justify-between gap-1 p-4" aria-label="Order progress">
          {ORDER_STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center gap-1 text-center text-[11px] font-semibold sm:text-xs" aria-current={i === idx ? 'step' : undefined}>
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${i <= idx ? 'bg-brand text-white' : 'bg-black/10 text-black/50'}`}>{i < idx ? '✓' : i + 1}</span>{pretty(s)}
            </li>
          ))}
        </ol>
      )}
      {cancelled && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">This order was cancelled. {order.refundRequired ? 'The canteen will arrange your refund.' : ''}</p>}

      {/* Sequential token: the only number people need. */}
      {!cancelled && (
        <div className={`card border-dashed p-5 text-center ${pickup.status === 'READY_TO_CLAIM' ? 'bg-eco' : ''}`}>
          <p className="text-sm font-semibold">Your token</p>
          {order.token ? <p className="my-1 font-display text-7xl font-extrabold leading-none" aria-label={`Token ${order.token}`}>{order.token}</p>
            : <p className="my-2 text-sm text-black/70">{order.paymentMethod === 'CASH_ON_PICKUP' ? 'Your token appears here once staff confirm your cash payment at the counter.' : 'Your token appears here as soon as your payment is confirmed.'}</p>}
          {order.token && <p className="text-sm text-black/70">{pickup.status === 'READY_TO_CLAIM' ? 'Ready now!' : pickup.status === 'PICKED_UP' ? 'Collected' : 'Staff serve tokens in order. This page updates by itself when it is ready.'}</p>}
        </div>
      )}
      {order.status === 'COLLECTED' && <p className="rounded-xl bg-black/5 p-3 text-sm">Collected {fmtDateTime(order.collectedAt)}. Thank you!</p>}
      {pickup.status === 'READY_TO_CLAIM' && <ReadyBanner order={order} />}
      {active && !cancelled && <QrPass orderId={order._id} status={order.status} />}
      {active && order.token && <QueueStrip orderId={order._id} />}

      <section className="card p-5" aria-label="Receipt">
        <h2 className="mb-3 text-xl font-bold">Receipt</h2>
        <p className="mb-2 text-sm text-black/60">Order {order.orderNumber}{order.token ? <> · <b className="text-ink">Token {order.token}</b></> : ''}</p>
        <table className="w-full text-sm"><thead className="text-left text-black/50"><tr><th className="pb-2 font-semibold">Item</th><th className="pb-2 text-right font-semibold">Qty</th><th className="pb-2 text-right font-semibold">Price</th></tr></thead>
          <tbody>{order.items.map((i) => <tr key={i.menuItem} className="border-t border-black/5"><td className="py-2">{i.name}<span className="text-black/50"> · {rupee(i.unitPrice)}</span></td><td className="py-2 text-right">{i.quantity}</td><td className="py-2 text-right">{rupee(i.lineTotal)}</td></tr>)}</tbody></table>
        <dl className="mt-3 space-y-1 border-t border-black/10 pt-3 text-sm">
          <div className="flex justify-between"><dt>Total</dt><dd className="font-bold">{rupee(order.total)}</dd></div>
          <div className="flex justify-between"><dt>Amount to pay</dt><dd className="font-bold">{rupee(order.amountDue)}</dd></div>
          <div className="flex justify-between"><dt>Payment method</dt><dd>{pretty(order.paymentMethod)}{payment?.isDemo ? ' (demo, no real money)' : ''}</dd></div>
          <div className="flex justify-between"><dt>Payment status</dt><dd><Badge value={order.paymentStatus} /></dd></div>
          <div className="flex justify-between"><dt>Pickup status</dt><dd><Badge value={order.status} /></dd></div>
          <div className="flex justify-between"><dt>Placed</dt><dd>{fmtDateTime(order.createdAt)}</dd></div>
        </dl>
        {payment?.isDemo && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Demo payment: this receipt does not represent a real transaction.</p>}
      </section>

      <ErrorBox error={err} />
      <div className="no-print flex flex-wrap gap-2">
        {needsPay && order.paymentMethod === 'DEMO' && <button className="btn btn-primary" onClick={() => setDemo(true)}>Pay {rupee(order.amountDue)} (demo)</button>}
        {needsPay && order.paymentMethod === 'ONLINE' && <button className="btn btn-primary" onClick={() => payOnline(order, done, setErr)}>Pay {rupee(order.amountDue)} online</button>}
        {order.status === 'PLACED' && order.paymentStatus !== 'PENDING' && !order.token && <button className="btn btn-ghost" onClick={cancel}>Cancel order</button>}
        <button className="btn btn-ghost" onClick={() => window.print()}>Print receipt</button>
      </div>
      {demo && <DemoPay order={order} onClose={() => setDemo(false)} onDone={done} />}
      <Toast toast={toast} />
    </div>
  );
}
