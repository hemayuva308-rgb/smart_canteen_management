import { useState } from 'react';
import { api } from '../session.js';
import { Badge, Empty, ErrorBox, Spinner, usePolling, useToast, Toast } from '../../shared/ui.jsx';
import { fmtDateTime, pretty, rupee } from '../../shared/format.js';

export default function Payments() {
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = usePolling(() => api.get(`/admin/payments${status ? `?status=${status}` : ''}`), 10000, [status]);
  const [err, setErr] = useState(null);
  const [toast, show] = useToast();
  const cash = async (p) => { setErr(null); try { await api.post(`/admin/orders/${p.order._id}/cash-received`); show('Cash recorded'); reload(); } catch (x) { setErr(x); } };
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Payments</h1>
      <div className="flex flex-wrap gap-2">{['', 'UNPAID', 'PENDING', 'PAID', 'FAILED'].map((s) => <button key={s || 'all'} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatus(s)}>{s ? pretty(s) : 'All'}</button>)}</div>
      <ErrorBox error={err || error} />
      {loading && !data && <Spinner />}
      {data && !data.payments.length && <Empty title="No payments match" />}
      <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-black/50"><tr><th className="p-3">Order</th><th>Student</th><th>Method</th><th>Amount</th><th>Status</th><th>When</th><th /></tr></thead>
        <tbody>{data?.payments.map((p) => (
          <tr key={p._id} className="border-t border-black/5"><td className="p-3 font-semibold">{p.order?.orderNumber}</td><td>{p.student?.name}</td><td>{pretty(p.method)}{p.isDemo && <span className="chip ml-1 bg-amber-100 text-amber-800">demo</span>}</td><td>{rupee(p.amount)}</td><td><Badge value={p.status} /></td><td>{fmtDateTime(p.paidAt || p.createdAt)}</td>
            <td>{p.method === 'CASH_ON_PICKUP' && p.status !== 'PAID' && p.order?.status !== 'CANCELLED' && <button className="btn btn-ghost btn-sm" onClick={() => cash(p)}>Cash received</button>}</td></tr>))}</tbody></table></div>
      <p className="text-xs text-black/50">Payment status is only ever changed by the server: cash confirmed here, a signed provider callback, or a clearly marked demo session.</p>
      <Toast toast={toast} />
    </div>
  );
}
