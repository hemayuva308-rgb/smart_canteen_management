import { useEffect, useRef, useState } from 'react';
import { FALLBACK_IMG, statusStyle, pretty, STATUS_LABEL } from './format.js';

export function Badge({ value, label }) {
  return <span className={`chip ${statusStyle[value] || 'bg-neutral-200 text-neutral-700'}`}>{label || STATUS_LABEL[value] || pretty(value)}</span>;
}

export function FoodImage({ src, alt = '', className = '' }) {
  const [bad, setBad] = useState(false);
  return <img src={bad || !src ? FALLBACK_IMG : src} alt={alt} loading="lazy" onError={() => setBad(true)} className={`object-cover ${className}`} />;
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-black/60">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}…
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {error.message || String(error)}
      {error.details?.length ? <ul className="mt-1 list-disc pl-5">{error.details.map((d, i) => <li key={i}>{d.field ? `${d.field}: ` : ''}{d.message}</li>)}</ul> : null}
      {onRetry && <button className="ml-3 font-semibold underline" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, hint, children }) {
  return (
    <div className="card p-8 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-black/60">{hint}</p>}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  );
}

export function Field({ label, error, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-black/50">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} className="pop max-h-[90vh] w-full overflow-auto rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none hover:bg-black/5">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Re-runs `fn` every `ms` while the tab is visible: this is how "live" status works (polling, not websockets).
export function usePolling(fn, ms = 10000, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const saved = useRef(fn);
  saved.current = fn;
  const run = async (silent) => {
    try { const data = await saved.current(); setState({ data, error: null, loading: false }); }
    catch (error) { setState((s) => ({ data: silent ? s.data : null, error, loading: false })); }
  };
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    run(false);
    const id = setInterval(() => { if (alive && !document.hidden) run(true); }, ms);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload: () => run(true) };
}

export function Toast({ toast }) {
  if (!toast) return null;
  return <div role="status" className={`pop fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg md:bottom-8 ${toast.type === 'error' ? 'bg-red-700' : 'bg-ink'}`}>{toast.msg}</div>;
}
export function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3200); };
  return [toast, show];
}
