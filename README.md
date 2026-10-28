# TAP & TAKE: Order Smart. Pick Up Fast.

College canteen pre-ordering with a token and a one-time QR pickup. Built for Yukti Ideathon 2026.

```
client/   React + Vite + Tailwind. Two sites: student (index.html) and admin dashboard (admin.html, served at /admin)
server/   Node + Express + Mongoose API, tests, seed and admin scripts
```

## Requirements
Node 18.18+ (tested on 22) and MongoDB 6+ (local, or an Atlas URI). Nothing else: there is no Python or ML part.

## How to run

```bash
# 1. API (terminal 1)
cd server
npm install
cp .env.example .env
#   edit .env and set JWT_SECRET (32+ chars). Generate one with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run seed:demo                                   # menu + settings + demo student
ADMIN_EMAIL=owner@college.edu npm run create-admin  # prints a generated admin password once
npm run dev                                         # http://localhost:5000

# 2. Web (terminal 2)
cd client
npm install
npm run dev     # student: http://localhost:5173    admin: http://localhost:5173/admin
```

Demo student (created only by `seed:demo`): `student@demo.tapandtake.local` / `Student@123`.
There is no default admin and no admin sign-up route; create one with `create-admin` as shown.

### Tests
```bash
cd server && npm test   # needs MongoDB; uses a separate database (MONGODB_URI_TEST, default mongodb://127.0.0.1:27017/tapandtake_test) and DROPS it
```

### Production build
`cd client && npm run build` produces `dist/` with `index.html` (student) and `admin.html`. Serve both statically and rewrite `/admin*` to `admin.html`. Set `VITE_API_URL` if the API is on another host and add the web origin to `CLIENT_ORIGINS`. Set `NODE_ENV=production`, a strong `JWT_SECRET`, and serve over HTTPS (the QR scanner needs the camera, which needs HTTPS).

## What the app does (matches the PPT)
| PPT feature | In the code |
|---|---|
| Student login, personal account, order history | Register/login, "My orders" with Active and History |
| Browse menu, prices, availability | Menu with search, categories, on-sale / unavailable state |
| Pre-order food, confirmation + receipt | Cart, server-side pricing, receipt page |
| Token + QR | Sequential token per service session, personal signed QR |
| Online pay or cash on pickup | Cash (staff confirm), online (Razorpay scaffold), demo mode for testing |
| Clear Paid vs Cash Pending display | Payment status badges for student and staff |
| Order status tracking, queue position | Placed / Confirmed / Preparing / Ready / Picked up, "N orders ahead of you" |
| Admin scan shows exact order | Scan QR screen: items, student, paid/unpaid, one-tap hand over |
| One-time QR, duplicate scan warning | Second scan says "Already collected at HH:MM. Do not serve again." |
| Admin menu, prices, stock control | Menu admin (add, edit, price, on-sale toggle, photo) |
| Admin console, manage orders | Overview, Live orders, Pickup desk, Prep list, Payments, Reports |
| Demand analytics | Reports: best sellers, sales per day, payment mix |

## Not built yet (PPT marks these as Proposed or Future)
- Pickup slots with capacity limits (full slots close)
- "Estimated ready by" time (today only the number of orders ahead is shown)
- Stock quantities, low-stock state and stock reservation (today an item is only on sale or off sale)
- Quick reorder and favourites
- Verified feedback linked to real orders
- Slot demand and sold-out trends in analytics
- Delay alerts and food filters (marked Future in the PPT)

## How the main flows work
1. **Order and token**: the student sends item ids and quantities only; the server prices from the database and creates an unpaid order. When payment becomes PAID (online, demo, or staff confirming cash), the order gets the next sequential token and moves PLACED to CONFIRMED. Tokens come from an atomic counter plus a unique `(session, token)` index, so parallel confirmations never duplicate a number. A new session (numbering restarts at 1) begins each day; staff can also start one at `POST /api/admin/session/start`.
2. **Payment** (status changes only on the server): `CASH_ON_PICKUP` stays UNPAID until staff press *Confirm cash received*; `ONLINE` is a Razorpay scaffold (HMAC-verified callback and webhook, not tested against the real provider); `DEMO` is play money, flagged `isDemo` and never counted as sales.
3. **Kitchen**: CONFIRMED, PREPARING, READY (forward only, and only once paid).
4. **Pickup (QR only)**: when READY, the receipt shows the token and QR. Staff scan it (*Scan QR*), see PAID / NOT PAID, and press *Hand over and close order*. The only route that collects an order is `POST /api/admin/pickup/complete`, which atomically checks paid, token, READY and not yet collected. Duplicate or racing requests cannot both win. Fallback without a camera: the *Pickup desk* token search.
5. **Retention**: nothing is deleted. Orders, payments, tokens and pickups stay, and an append-only `AuditLog` records token assignment, payment confirmation and pickup.

## API overview
All under `/api`, JSON, `Authorization: Bearer <jwt>`. Errors: `{ error, code, details? }`.

| Area | Endpoints |
|---|---|
| Public | `GET /health`, `GET /config`, `GET /menu?q=&category=` |
| Auth | `POST /auth/register`, `POST /auth/login` (students), `POST /auth/admin/login`, `GET/PATCH /auth/me`, `POST /auth/change-password` |
| Student | `POST /orders`, `GET /orders?scope=active\|history\|all`, `GET /orders/:id`, `GET /orders/:id/qr`, `GET /queue`, `POST /orders/:id/cancel`, `POST /orders/:id/payment/initiate`, `.../payment/demo-confirm`, `.../payment/verify` |
| Webhook | `POST /webhooks/razorpay` (signature required) |
| Admin (role ADMIN) | `GET /admin/overview`, `GET /admin/queue`, `GET/POST /admin/session...`; menu: `GET/POST /admin/menu`, `PATCH /admin/menu/:id`, `PATCH /admin/menu/:id/availability`, `DELETE /admin/menu/:id` (soft), `POST /admin/menu/image`; orders: `GET /admin/orders`, `GET /admin/orders/aggregate`, `PATCH /admin/orders/:id/status`, `POST /admin/orders/:id/cancel`, `POST /admin/orders/:id/cash-received`; pickup: `POST /admin/scan`, `POST /admin/pickup/lookup`, `POST /admin/pickup/complete`; `GET /admin/prep-list`, `GET /admin/payments`, `GET /admin/reports?days=` |

## Security notes
bcrypt hashing (`bcryptjs`), JWT with the role re-checked against the database on every request, zod validation with unknown fields rejected, helmet, CORS allow-list, rate limits (stricter on auth), atomic conditional updates for every state change that must happen once, unique indexes as a second guard, secrets only from environment variables. Tokens are kept in `localStorage` for simplicity; an httpOnly-cookie session would be stronger for production.

## Honest limitations
- Online payments are a scaffold, untested without real Razorpay credentials. Demo payments move no money.
- No automated refunds: cancelling a paid order flags `refundRequired` and staff refund manually.
- "Live" updates are polling (every 6 to 20 seconds while the tab is open).
- Money is whole rupees. "Today" and the daily session use the server timezone (set `TZ`).
