import { createContext, useContext, useEffect, useState } from 'react';

const Ctx = createContext(null);
const KEY = 'tt_cart_v1';

// The cart only remembers which items and how many. Prices shown here are for display; the server re-prices every order.
export function CartProvider({ children }) {
  const [lines, setLines] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* storage unavailable */ } }, [lines]);
  const add = (item) => setLines((ls) => {
    const f = ls.find((l) => l.id === item._id);
    if (f) return ls.map((l) => (l.id === item._id ? { ...l, qty: Math.min(10, l.qty + 1) } : l));
    return [...ls, { id: item._id, name: item.name, price: item.price, imageUrl: item.imageUrl, qty: 1 }];
  });
  const setQty = (id, qty) => setLines((ls) => (qty < 1 ? ls.filter((l) => l.id !== id) : ls.map((l) => (l.id === id ? { ...l, qty: Math.min(10, qty) } : l))));
  const clear = () => setLines([]);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((n, l) => n + l.qty * l.price, 0);
  return <Ctx.Provider value={{ lines, add, setQty, clear, count, total }}>{children}</Ctx.Provider>;
}
export const useCart = () => useContext(Ctx);
