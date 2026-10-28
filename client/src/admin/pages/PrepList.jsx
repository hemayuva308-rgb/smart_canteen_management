import { api } from '../session.js';
import { Empty, ErrorBox, Spinner, usePolling } from '../../shared/ui.jsx';

// What to cook today, straight from the day's pre-orders.
export default function PrepList() {
  const list = usePolling(() => api.get('/admin/prep-list'), 15000, []);
  const items = list.data?.items || [];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-extrabold">Prep list</h1>
      <p className="text-sm text-black/60">Today's pre-orders by dish. <b>Paid</b> is certain demand; <b>Unpaid</b> is cash orders not confirmed yet. Cancelled orders are left out.</p>
      <ErrorBox error={list.error} />
      {list.loading && !list.data && <Spinner />}
      {list.data && (
        <>
          <div className="grid grid-cols-2 gap-3"><div className="card p-4"><p className="text-sm text-black/60">Portions ordered</p><p className="font-display text-4xl font-extrabold">{list.data.totals.ordered}</p></div><div className="card p-4"><p className="text-sm text-black/60">Still to serve</p><p className="font-display text-4xl font-extrabold">{list.data.totals.toServe}</p></div></div>
          {!items.length ? <Empty title="No orders yet today" hint="Dishes appear here as students pre-order." /> : (
            <div className="card overflow-x-auto"><table className="w-full text-left text-sm">
              <thead><tr className="border-b border-black/10"><th className="p-3">Dish</th><th className="p-3">Ordered</th><th className="p-3">Paid</th><th className="p-3">Unpaid</th><th className="p-3">Served</th><th className="p-3">To serve</th></tr></thead>
              <tbody>{items.map((r) => <tr key={r.name} className="border-b border-black/5"><td className="p-3 font-semibold">{r.name}</td><td className="p-3 font-display text-xl font-extrabold">{r.ordered}</td><td className="p-3">{r.paid}</td><td className="p-3">{r.unpaid}</td><td className="p-3">{r.collected}</td><td className="p-3 font-bold">{r.toServe}</td></tr>)}</tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  );
}
