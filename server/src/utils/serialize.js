// What the browser is allowed to see. Internal lock fields and the retired pickup code never leave the server.
const HIDDEN = ['pickupToken', 'tokenClaimAt', '__v'];

export function orderToClient(order) {
  const o = order.toObject ? order.toObject() : { ...order };
  for (const k of HIDDEN) delete o[k];
  o.token = o.tokenNumber ?? null;
  return o;
}

/** Single place that decides what a receipt may do. The client only displays this; the server re-checks on every action. */
export function pickupState(order) {
  const hasToken = order.tokenNumber != null;
  let status = 'NOT_READY';
  if (order.status === 'CANCELLED') status = 'CANCELLED';
  else if (order.status === 'COLLECTED') status = 'PICKED_UP';
  else if (order.status === 'READY' && order.paymentStatus === 'PAID' && hasToken) status = 'READY_TO_CLAIM';
  else if (order.paymentStatus !== 'PAID') status = 'AWAITING_PAYMENT';
  return {
    status,
    isActive: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status),
  };
}
