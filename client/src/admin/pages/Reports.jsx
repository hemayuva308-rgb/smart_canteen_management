import { useState } from 'react';
import { api } from '../session.js';
import { ErrorBox, Spinner, usePolling } from '../../shared/ui.jsx';
import { pretty, rupee } from '../../shared/format.js';

export default function Reports() {
  const [days, setDays] = useState(7);
  const { data, error, loading, reload } = usePolling(() => api.get(`/admin/reports?days=${days}`), 30000, [days]);
  const max = Math.max(1, ...(data?.daily || []).map((d) => d.sales));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-3xl font-extrabold">Reports</h1><div className="flex gap-2">{[7, 30, 90].map((d) => <button key={d} className={`btn btn-sm ${days === d ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDays(d)}>Last {d} days</button>)}</div></div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Spinner />}
      {data && <>
        <section className="card p-4"><h2 className="mb-3 font-bold">Sales per day (paid orders)</h2>
          {!data.daily.length ? <p className="text-sm text-black/60">No paid orders in this period.</p> : (
            <ul className="space-y-1.5">{data.daily.map((d) => <li key={d._id} className="flex items-center gap-3 text-sm"><span className="w-24 shrink-0">{d._id}</span><span className="h-5 rounded bg-brand" style={{ width: `${Math.max(2, (d.sales / max) * 100)}%` }} aria-hidden="true" /><span className="shrink-0 font-semibold">{rupee(d.sales)} · {d.orders} orders</span></li>)}</ul>)}</section>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card p-4"><h2 className="mb-2 font-bold">Best sellers</h2><ol className="space-y-1 text-sm">{data.topItems.map((i) => <li key={i._id} className="flex justify-between"><span>{i._id}</span><span>{i.quantity} sold · {rupee(i.revenue)}</span></li>)}</ol></section>
          <section className="card p-4"><h2 className="mb-2 font-bold">Paid by method</h2><ul className="space-y-1 text-sm">{data.paidByMethod.map((m, i) => <li key={i} className="flex justify-between"><span>{pretty(m.method)}{m.isDemo ? ' (demo, not real money)' : ''}</span><span>{m.count} · {rupee(m.amount)}</span></li>)}{!data.paidByMethod.length && <li className="text-black/60">None yet</li>}</ul></section>
          <section className="card p-4"><h2 className="mb-2 font-bold">Orders by status</h2><ul className="space-y-1 text-sm">{data.ordersByStatus.map((s) => <li key={s._id} className="flex justify-between"><span>{pretty(s._id)}</span><span>{s.count}</span></li>)}</ul></section>
        </div>
        <p className="text-xs text-black/50">Demand analytics: best sellers, sales per day and payment mix. Demo payments are labelled and are not real money.</p>
      </>}
    </div>
  );
}
