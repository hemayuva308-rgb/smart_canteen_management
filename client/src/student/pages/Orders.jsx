import { Link } from 'react-router-dom';
import { api } from '../session.js';
import { Badge, Empty, ErrorBox, Spinner, usePolling } from '../../shared/ui.jsx';
import { fmtDateTime, rupee } from '../../shared/format.js';

function OrderRow({ o }) {
  return (
    <li>
      <Link to={`/orders/${o._id}`} className="card flex items-center justify-between gap-3 p-4 hover:bg-brand-soft">
        <div className="min-w-0">
          <p className="font-bold">{o.token ? `Token ${o.token}` : 'Awaiting payment'} <span className="font-normal text-black/50">· {o.orderNumber}</span></p>
          <p className="truncate text-sm text-black/60">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
          <p className="mt-1 text-xs text-black/50">{fmtDateTime(o.createdAt)}</p>
        </div>
        <div className="shrink-0 space-y-1 text-right"><p className="font-extrabold">{rupee(o.total)}</p><Badge value={o.status} /> <Badge value={o.paymentStatus} /></div>
      </Link>
    </li>
  );
}

export default function Orders() {
  const active = usePolling(() => api.get('/orders?scope=active'), 10000, []);
  const history = usePolling(() => api.get('/orders?scope=history'), 30000, []);
  if (active.loading && !active.data) return <Spinner />;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold">My orders</h1>
      <ErrorBox error={active.error} onRetry={active.reload} />

      <section aria-label="Active orders">
        <h2 className="mb-2 text-xl font-bold">Active</h2>
        {active.data && !active.data.orders.length && <Empty title="No active orders" hint="Orders you are waiting for show up here until you collect them."><Link to="/" className="btn btn-primary">Order something</Link></Empty>}
        <ul className="space-y-3">{active.data?.orders.map((o) => <OrderRow key={o._id} o={o} />)}</ul>
      </section>

      <section aria-label="Order history">
        <h2 className="mb-2 text-xl font-bold">History</h2>
        {history.data && !history.data.orders.length && <p className="text-sm text-black/60">Collected and cancelled orders will be kept here as receipts.</p>}
        <ul className="space-y-3">{history.data?.orders.map((o) => <OrderRow key={o._id} o={o} />)}</ul>
      </section>
    </div>
  );
}
