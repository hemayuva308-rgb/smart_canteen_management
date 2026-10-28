import { useState } from 'react';
import { api } from '../session.js';
import { Badge, Empty, ErrorBox, Spinner, usePolling, useToast, Toast } from '../../shared/ui.jsx';
import { rupee } from '../../shared/format.js';

// Staff view of the pickup queue (in token order) and the fallback when a QR cannot be scanned.
// Collecting always happens here or on the Scan QR screen, never from the student's phone.
export default function Pickup() {
  const queue = usePolling(() => api.get('/admin/queue'), 6000, []);
  const [find, setFind] = useState('');
  const [err, setErr] = useState(null);
  const [busyId, setBusy] = useState(null);
  const [toast, show] = useToast();

  async function hand(o, body, msg) {
    if (busyId) return;
    setBusy(o._id); setErr(null);
    try { await api.post('/admin/pickup/complete', { orderId: o._id, ...body }); show(msg); queue.reload(); }
    catch (e) { setErr(e); queue.reload(); } finally { setBusy(null); }
  }
  const list = (queue.data?.queue || []).filter((o) => !find || String(o.tokenNumber) === find.replace('#', ''));
  const ready = list.filter((o) => o.status === 'READY');
  const waiting = list.filter((o) => o.status !== 'READY');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-extrabold">Pickup desk</h1>
      <div className="card flex items-end gap-3 p-4"><label className="block flex-1"><span className="label">Find a token number</span><input className="input font-display text-2xl" inputMode="numeric" value={find} onChange={(e) => setFind(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 7" /></label>{find && <button className="btn btn-ghost" onClick={() => setFind('')}>Clear</button>}</div>
      <ErrorBox error={err || queue.error} />
      {queue.loading && !queue.data && <Spinner />}

      <section aria-label="Ready for pickup"><h2 className="mb-2 text-lg font-bold">Ready, serve in this order ({ready.length})</h2>
        {!ready.length && <Empty title="Nobody waiting at the counter" hint="Mark orders ready in Live orders and they appear here." />}
        <ul className="space-y-3">{ready.map((o, i) => (
          <li key={o._id} className="card space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3"><span className="rounded-xl bg-ink px-3 py-1 font-display text-3xl font-extrabold text-white">#{o.tokenNumber}</span><div><p className="font-semibold">{o.studentName}{i === 0 && !find && <span className="ml-2 rounded-full bg-eco px-2 py-0.5 text-xs font-bold text-eco-deep">Next</span>}</p><p className="text-sm text-black/60">{o.orderNumber} · {rupee(o.total)}</p></div></div>
              <div className="flex gap-1"><Badge value={o.status} /><Badge value={o.paymentStatus} /></div>
            </div>
            <ul className="text-sm">{o.items.map((x) => <li key={x.menuItem}><b>{x.quantity}×</b> {x.name}</li>)}</ul>
            <button className="btn btn-primary w-full" disabled={busyId === o._id} onClick={() => hand(o, {}, `Token ${o.tokenNumber} picked up`)}>Mark picked up</button>
          </li>))}</ul>
      </section>

      <section aria-label="Still being prepared"><h2 className="mb-2 text-lg font-bold">Being prepared ({waiting.length})</h2>
        <ul className="flex flex-wrap gap-2">{waiting.map((o) => <li key={o._id} className="rounded-xl bg-brand-soft px-3 py-2"><span className="font-display text-xl font-extrabold">#{o.tokenNumber}</span> <Badge value={o.status} /></li>)}</ul>
      </section>
      <Toast toast={toast} />
    </div>
  );
}
