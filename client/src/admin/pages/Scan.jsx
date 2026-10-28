import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api } from '../session.js';
import { Badge, ErrorBox, useToast, Toast } from '../../shared/ui.jsx';
import { rupee } from '../../shared/format.js';

const TONE = {
  READY_PAID: ['bg-eco text-eco-deep', 'PAID · READY'],
  NOT_PAID: ['bg-red-600 text-white', 'NOT PAID'],
  NOT_READY: ['bg-amber-400 text-black', 'PAID · NOT READY'],
  ALREADY_COLLECTED: ['bg-red-600 text-white', 'ALREADY COLLECTED'],
  CANCELLED: ['bg-neutral-700 text-white', 'CANCELLED'],
};

// Counter screen: scan the student's QR, see PAID / NOT PAID, hand over, and the order closes. Camera needs HTTPS (localhost is fine).
export default function Scan() {
  const video = useRef(null);
  const busyRef = useRef(false);
  const codeRef = useRef('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [camErr, setCamErr] = useState(null);
  const [manual, setManual] = useState('');
  const [working, setWorking] = useState(false);
  const [toast, show] = useToast();

  const lookup = useCallback(async (code) => {
    if (busyRef.current) return;
    busyRef.current = true; setErr(null); codeRef.current = code; // stays locked after an error until staff press Scan again, so a bad QR is not re-sent in a loop
    try { setResult(await api.post('/admin/scan', { code })); navigator.vibrate?.(60); }
    catch (e) { setErr(e); }
  }, []);
  const next = () => { setResult(null); setErr(null); busyRef.current = false; };

  useEffect(() => {
    let stream, raf, alive = true;
    const canvas = document.createElement('canvas');
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        video.current.srcObject = stream; await video.current.play();
        const tick = () => {
          const v = video.current;
          if (alive && v && v.readyState >= 2 && !busyRef.current) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(v, 0, 0);
            const hit = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
            if (hit?.data) lookup(hit.data);
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setCamErr('Camera is not available (it needs HTTPS and permission). Paste the code below, or use the Pickup desk.'); }
    }
    start();
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [lookup]);

  async function act(fn, msg) {
    if (working) return;
    setWorking(true); setErr(null);
    try { await fn(); show(msg); } catch (e) { setErr(e); } finally { setWorking(false); }
  }
  const o = result?.order;
  const handOver = () => act(async () => {
    await api.post('/admin/pickup/complete', { orderId: o._id });
    next();
  }, 'Handed over. Order closed.');
  const cash = () => act(async () => {
    await api.post(`/admin/orders/${o._id}/cash-received`);
    setResult(await api.post('/admin/scan', { code: codeRef.current }));
  }, 'Cash confirmed. Token created, send it to the kitchen.');

  const [tone, label] = result ? TONE[result.verdict] : [];
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-3xl font-extrabold">Scan QR</h1>
      {!result && (
        <>
          <div className="overflow-hidden rounded-2xl bg-ink">
            <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
          </div>
          {camErr ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{camErr}</p> : <p className="text-center text-sm text-black/60">Point the camera at the student's QR.</p>}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) lookup(manual.trim()); }}>
            <input className="input flex-1" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or paste the code (TT1.…)" aria-label="QR code text" />
            <button className="btn btn-ghost">Check</button>
          </form>
        </>
      )}
      <ErrorBox error={err} />
      {err && !result && <button className="btn btn-ghost w-full" onClick={next}>Scan again</button>}

      {result && (
        <div className="card space-y-3 p-4">
          <div className={`rounded-2xl p-4 text-center ${tone}`}>
            <p className="font-display text-3xl font-extrabold">{label}</p>
            <p className="mt-1 text-sm font-semibold">{result.message}</p>
          </div>
          <div className="flex items-center gap-3">
            {o.token != null && <span className="rounded-xl bg-ink px-3 py-1 font-display text-3xl font-extrabold text-white">#{o.token}</span>}
            <div><p className="text-lg font-bold">{o.studentName}</p><p className="text-sm text-black/60">{o.orderNumber} · {rupee(o.total)} · <Badge value={o.paymentStatus} /></p></div>
          </div>
          <ul className="text-sm">{o.items.map((x) => <li key={x.menuItem}><b>{x.quantity}×</b> {x.name}</li>)}</ul>

          {result.canConfirmCash && <button className="btn btn-primary w-full" disabled={working} onClick={cash}>Cash received {rupee(o.amountDue)}</button>}
          {result.canCollect && <button className="btn btn-primary w-full" disabled={working} onClick={handOver}>Hand over and close order</button>}
          <button className="btn btn-ghost w-full" onClick={next}>Scan next</button>
        </div>
      )}
      <Toast toast={toast} />
    </div>
  );
}
