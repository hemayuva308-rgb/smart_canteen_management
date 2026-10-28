import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from './session.js';

// Personal pickup QR. Staff scan it at the counter: it shows PAID / NOT PAID, and the order closes when they hand the food over.
export default function QrPass({ orderId, status }) {
  const [img, setImg] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get(`/orders/${orderId}/qr`)
      .then(({ code }) => QRCode.toDataURL(code, { width: 480, margin: 2, errorCorrectionLevel: 'M' }))
      .then((url) => alive && setImg(url))
      .catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [orderId]);
  if (err) return null; // the token and queue below still work without it
  return (
    <div className="card p-4 text-center">
      <p className="text-sm font-semibold">Show this QR at the counter</p>
      {img ? <img src={img} alt="Your pickup QR code" className="mx-auto my-2 h-56 w-56 rounded-xl bg-white" /> : <div className="mx-auto my-2 h-56 w-56 animate-pulse rounded-xl bg-black/5" />}
      <p className="text-xs text-black/60">{status === 'READY' ? 'Ready now. Staff scan, hand over, done. No cash, no change, no talking.' : 'Staff scan it to see paid or not paid. It works only for you and only once.'}</p>
    </div>
  );
}
