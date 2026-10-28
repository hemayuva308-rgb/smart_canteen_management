import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './session.js';
import { useCart } from './cart.jsx';
import { Spinner } from '../shared/ui.jsx';
import { useState, useEffect } from 'react';
import Login from './pages/Login.jsx';
import Menu from './pages/Menu.jsx';
import Cart from './pages/Cart.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Profile from './pages/Profile.jsx';

const icon = {
  menu: 'M4 6h16M4 12h16M4 18h10',
  orders: 'M6 4h12v16l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  bag: 'M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2',
};
const Icon = ({ d }) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="TAP & TAKE home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white"><Icon d={icon.bag} /></span>
      <span className="font-display text-xl font-extrabold leading-none">TAP <span className="text-brand">&amp;</span> TAKE</span>
    </Link>
  );
}


// "Install" without any app store: Android/Chrome shows the real install prompt; iPhone shows the Share menu steps.
function InstallBanner() {
  const [evt, setEvt] = useState(null);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('tt-install-dismissed') === '1'; } catch { return false; } });
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => { const h = (e) => { e.preventDefault(); setEvt(e); }; window.addEventListener('beforeinstallprompt', h); return () => window.removeEventListener('beforeinstallprompt', h); }, []);
  const dismiss = () => { setHidden(true); try { localStorage.setItem('tt-install-dismissed', '1'); } catch { /* ignore */ } };
  if (standalone || hidden || (!evt && !ios)) return null;
  return (
    <div className="no-print flex items-center justify-between gap-3 bg-brand-soft px-4 py-2 text-sm">
      <p className="font-semibold">{evt ? 'Install TAP & TAKE on your phone: no Play Store needed.' : 'Install: tap Share, then "Add to Home Screen".'}</p>
      <div className="flex shrink-0 gap-2">
        {evt && <button className="btn btn-primary btn-sm" onClick={async () => { evt.prompt(); await evt.userChoice.catch(() => {}); setEvt(null); }}>Install</button>}
        <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label="Dismiss">Not now</button>
      </div>
    </div>
  );
}

function Shell({ children }) {
  const { count } = useCart();
  const nav = [['/', 'Menu', icon.menu], ['/orders', 'Orders', icon.orders], ['/profile', 'Me', icon.user]];
  const cls = ({ isActive }) => `flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-xs font-semibold md:flex-row md:gap-2 md:text-sm ${isActive ? 'text-brand' : 'text-black/60 hover:text-ink'}`;
  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <header className="no-print sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {nav.map(([to, label, d]) => (
              <NavLink key={to} to={to} end={to === '/'} className={cls}>
                <Icon d={d} />{label}
              </NavLink>
            ))}
          </nav>
          <Link to="/cart" className="btn btn-primary relative" aria-label={`Cart, ${count} items`}>
            <Icon d={icon.bag} /> Cart
            {count > 0 && <span className="rounded-full bg-white px-1.5 text-xs font-bold text-brand">{count}</span>}
          </Link>
        </div>
      </header>
      <InstallBanner />
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-black/10 bg-white px-1 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden" aria-label="Main">
        {nav.map(([to, label, d]) => (
          <NavLink key={to} to={to} end={to === '/'} className={cls}>
            <Icon d={d} />{label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Private({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner label="Starting" />;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={user ? <Private><Menu /></Private> : <PublicMenu />} />
      <Route path="/cart" element={<Private><Cart /></Private>} />
      <Route path="/orders" element={<Private><Orders /></Private>} />
      <Route path="/orders/:id" element={<Private><OrderDetail /></Private>} />
      <Route path="/profile" element={<Private><Profile /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Visitors can browse the menu before signing in.
function PublicMenu() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-black/5 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3"><Logo /><Link to="/login" className="btn btn-primary">Sign in</Link></div></header>
      <main className="mx-auto max-w-6xl px-4 py-5"><Menu publicView /></main>
    </div>
  );
}
