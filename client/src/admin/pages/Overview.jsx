import { Link } from 'react-router-dom';
import { api } from '../session.js';
import { Badge, ErrorBox, Spinner, usePolling } from '../../shared/ui.jsx';
import { rupee } from '../../shared/format.js';

export default function Overview() {
  const { data, error, loading, reload } = usePolling(() => api.get('/admin/overview'), 10000, []);
  const queue = usePolling(() => api.get('/admin/queue'), 10000, []);
  if (loading && !data) return <Spinner />;
  const cards = data && [
    ['Paid orders today', data.todayOrders, '/orders'], ['Sales today (real payments)', rupee(data.salesToday), '/payments'],
    ['Online received today', rupee(data.onlineReceivedToday), '/payments'], ['Cash received today', rupee(data.cashReceivedToday), '/payments'],
    ['Awaiting payment', data.awaitingPayment, '/orders'], ['In pickup queue', data.queueSize, '/pickup'],
    ['Waiting to prepare', data.pendingOrders, '/orders'], ['Ready for pickup', data.readyOrders, '/pickup'],
    ['Cash orders awaiting payment', data.cashAwaiting, '/orders'],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Overview</h1>
      <ErrorBox error={error} onRetry={reload} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards?.map(([label, value, to, alert]) => (
          <Link key={label} to={to} className={`card p-4 ${alert ? 'border-red-300 bg-red-50' : ''}`}><p className="text-sm text-black/60">{label}</p><p className={`font-display text-3xl font-extrabold ${alert ? 'text-red-700' : ''}`}>{value}</p></Link>
        ))}
      </div>

      <section className="card p-4" aria-label="Active pickup queue">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold">Active pickup queue</h2><Link to="/pickup" className="text-sm font-semibold text-brand">Pickup desk</Link></div>
        {queue.data && !queue.data.queue.length && <p className="text-sm text-black/60">Nothing in the queue. Picked-up orders leave it automatically and stay in order history.</p>}
        <ul className="flex flex-wrap gap-2">{queue.data?.queue.map((o) => (
          <li key={o._id} className={`rounded-xl px-3 py-2 ${o.status === 'READY' ? 'bg-eco' : 'bg-brand-soft'}`}><span className="font-display text-2xl font-extrabold">#{o.tokenNumber}</span> <Badge value={o.status} /></li>
        ))}</ul>
      </section>
      <p className="text-sm text-black/50">Updates every 10 seconds from the database. Sales count only orders that are paid, not cancelled and not demo (service session {data?.session}).{data?.demoExcludedToday?.orders > 0 ? ` Excluded today: ${data.demoExcludedToday.orders} demo order(s), ${rupee(data.demoExcludedToday.amount)} of play money.` : ''}</p>
    </div>
  );
}
