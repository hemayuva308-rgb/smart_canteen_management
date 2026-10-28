export const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const FALLBACK_IMG = '/food/thali.svg';

export const ORDER_STEPS = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'COLLECTED'];
export const statusStyle = {
  PLACED: 'bg-amber-100 text-amber-800', CONFIRMED: 'bg-sky-100 text-sky-800', PREPARING: 'bg-orange-100 text-orange-800',
  READY: 'bg-eco text-eco-deep', COLLECTED: 'bg-neutral-200 text-neutral-700', CANCELLED: 'bg-red-100 text-red-700',
  UNPAID: 'bg-neutral-200 text-neutral-700', PENDING: 'bg-amber-100 text-amber-800', PAID: 'bg-eco text-eco-deep', FAILED: 'bg-red-100 text-red-700',
};
// Friendly names for stored statuses (the database keeps COLLECTED; people see "Picked up").
export const STATUS_LABEL = { COLLECTED: 'Picked up', PLACED: 'Awaiting payment', CONFIRMED: 'Confirmed' };
export const pretty = (s) => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
