# Fresh Mart — Grocery Store POS & Inventory

A production-shaped point-of-sale and inventory application for a grocery store:
an Expo/React Native app for the till, a TypeScript Express API, and a Supabase
Postgres database.

The core loop is **scan → cart → checkout → stock deducted**, and the whole
design is built around making that loop fast and impossible to get into an
inconsistent state.

```
grocery-app/
├── mobile-app/          Expo (SDK 57) + React Native 0.86 + TypeScript
│   └── src/
│       ├── components/  Design-system primitives + domain components
│       ├── screens/     18 screens, grouped by feature
│       ├── navigation/  Root/auth/tab navigators, typed routes
│       ├── services/    API client, endpoints, secure storage, image upload
│       ├── hooks/       useAsync, usePaginatedList, useDebounce, useScanFeedback
│       ├── store/       Zustand: auth, cart, UI/toasts
│       ├── theme/       Colour, type, spacing, elevation tokens
│       ├── types/       API contract types
│       └── utils/       Formatting, error normalisation
│
├── backend/             Node 18+ / Express 4 / TypeScript
│   └── src/
│       ├── config/      Validated env, logger, Supabase clients
│       ├── controllers/ Thin HTTP adapters
│       ├── services/    Business logic
│       ├── routes/      Route tables + middleware wiring
│       ├── middleware/  Auth, authorisation, validation, errors, rate limits
│       ├── validators/  Zod request schemas
│       ├── utils/       ApiError, response envelope, pagination, money
│       ├── types/       Hand-maintained Supabase schema types
│       └── scripts/     Migration runner, setup.sql builder, staff-account seeder
│
├── supabase/
│   ├── migrations/      0001–0010, run in order
│   └── seed.sql         30 demo products with real EAN-13 barcodes
│
└── docs/API.md          Full endpoint reference
```

---

## The one design decision worth reading first

**Checkout runs entirely inside a Postgres function.**

Validating stock, creating the order and its line items, deducting inventory,
writing the ledger entries, recording the payment and closing the cart all
happen in a single transaction inside
[`checkout_cart()`](supabase/migrations/0004_functions.sql). Stock rows are
locked with `FOR NO KEY UPDATE`, ordered by `product_id` so two concurrent
checkouts cannot deadlock.

Doing this from the API layer would race: two tills scanning the last unit could
each read `quantity = 1` and both sell it. With the transaction in the database,
either the whole sale commits or none of it does, and the second till gets a 409
naming the product that ran out.

The same applies to every stock change: `adjust_inventory()` locks the row,
applies the delta and writes the matching `inventory_movements` entry together —
so `inventory.quantity` and the ledger can never disagree.

---

## 1 · Supabase setup

### 1.1 Create the project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Settings → API** and note:
   - **Project URL** — e.g. `https://xxxxxxxx.supabase.co`
   - **anon / publishable key** — safe to ship in the mobile bundle
   - **service_role / secret key** — server-only, bypasses Row Level Security

### 1.2 Run the migrations

Three ways, pick one.

**A · Migration runner (recommended)** — tracks what has been applied, so it is
safe to re-run and tells you if a migration was edited after the fact.

Copy your connection string from the dashboard: **Connect** (top bar) →
**Session pooler** → copy the URI, replace `[YOUR-PASSWORD]` with your database
password, and put it in `backend/.env`:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Use the **session** pooler on port 5432, not the transaction pooler on 6543 —
migrations need a real session and 6543 does not support all DDL.

```bash
cd grocery-app/backend
npm run db:migrate      # apply migrations
npm run db:seed         # apply migrations, then load the demo catalogue
npm run db:status       # show what is applied, change nothing
```

Applied migrations are recorded in `public.schema_migrations` with a checksum.
Each file runs in its own transaction, so a failure rolls that file back whole
rather than leaving the schema halfway through one.

**B · One paste** — no credentials needed beyond dashboard access.
Open the **SQL Editor**, paste all of [`supabase/setup.sql`](supabase/setup.sql)
and run it. That file is generated from the migrations plus the seed, in order,
and ends with a PostgREST schema-cache reload.

**C · Supabase CLI**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

Whichever route, the files run **in order** — 0006's `REVOKE` statements
reference functions created in 0004, 0007's storage policies call
`is_staff()` from 0006, and 0008 hardens everything before it:

| # | File | What it does |
|---|------|--------------|
| 1 | `supabase/migrations/0001_extensions_and_enums.sql` | `pgcrypto`, `pg_trgm`, `citext`; enums; `set_updated_at()` trigger |
| 2 | `supabase/migrations/0002_core_tables.sql` | `users`, `categories`, `products`, `inventory`, `inventory_movements` |
| 3 | `supabase/migrations/0003_carts_and_orders.sql` | `carts`, `cart_items`, `orders`, `order_items`, `payments` |
| 4 | `supabase/migrations/0004_functions.sql` | `adjust_inventory`, `checkout_cart`, `get_or_create_active_cart`, `dashboard_stats`, `sales_trend` |
| 5 | `supabase/migrations/0005_views.sql` | `products_with_stock`, `low_stock_products`, `inventory_movement_details`, `order_summaries` |
| 6 | `supabase/migrations/0006_rls.sql` | Row Level Security policies and function grants |
| 7 | `supabase/migrations/0007_storage.sql` | `product-images` bucket + storage policies |
| 8 | `supabase/migrations/0008_security_hardening.sql` | Clients become read-only; roles only from `app_metadata`; business functions callable by the API alone |
| 9 | `supabase/migrations/0009_barcode_and_inventory_hardening.sql` | One product per barcode in any GTIN format; movement direction checks; idempotent stock changes; atomic recount (`set_inventory_count`), add-to-cart (`add_cart_item`) and `inventory_summary` |
| 10 | `supabase/migrations/0010_store_time_and_stock_recency.sql` | Dashboard days, sales trend and order-number dates in store time (`Asia/Kolkata` — edit the file for another zone); `inventory_levels` view for the inventory "Recent" sort |

0009 stops with an error naming the products if the catalogue already holds
one barcode under two formats (e.g. `012345678905` and `0012345678905`) —
recode or merge those, then run it again.

All migrations are idempotent (`if not exists` / `on conflict do nothing`), so
re-running them is safe.

`setup.sql` is generated — after changing a migration or the seed, rebuild it
with `npm run db:build-setup` in `backend/` rather than editing it.

> **After a manual paste (route B or C):** PostgREST caches the schema. If the
> API 404s with `PGRST205` / `PGRST202` on tables or functions you just created,
> run `notify pgrst, 'reload schema';` in the SQL Editor. `setup.sql` and the
> migration runner both do this for you.

### 1.3 What the seed creates

- **7 categories** — Fruits & Vegetables, Dairy & Eggs, Bakery, Beverages,
  Snacks, Staples & Grains, Household
- **30 products** with check-digit-valid EAN-13 barcodes
- **Opening stock** booked through `adjust_inventory()`, so every product starts
  with a real `purchase` ledger entry rather than stock appearing from nowhere
- Deliberately mixed stock states so the low-stock, out-of-stock and healthy UI
  states are all visible immediately

See [§7 Sample products](#7--sample-products-for-testing) for barcodes to scan.

---

## 2 · Backend setup

```bash
cd grocery-app/backend
npm install
cp .env.example .env      # then fill in the Supabase values
npm run dev               # http://localhost:4000/api/v1
```

### Environment variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `NODE_ENV` | – | `development` | `development` \| `test` \| `production` |
| `PORT` | – | `4000` | |
| `API_PREFIX` | – | `/api/v1` | Must start with `/` |
| `LOG_LEVEL` | – | `info` | `fatal`…`trace`; pretty-printed outside production |
| `CORS_ORIGINS` | – | `*` | Comma-separated list, or `*` for any (dev only) |
| **`SUPABASE_URL`** | **yes** | – | Project URL |
| **`SUPABASE_ANON_KEY`** | **yes** | – | anon / publishable key |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **yes** | – | service_role key — **never** ship to the client |
| `SUPABASE_STORAGE_BUCKET` | – | `product-images` | |
| `DATABASE_URL` | migrations only | – | Session-pooler Postgres URI; used by `npm run db:migrate`, never by the API |
| `RATE_LIMIT_WINDOW_MS` | – | `60000` | |
| `RATE_LIMIT_MAX` | – | `300` | Per signed-in user |
| `RATE_LIMIT_IP_MAX` | – | `3000` | Per client IP; tills in one store usually share an IP, so keep it well above `RATE_LIMIT_MAX` |
| `AUTH_RATE_LIMIT_MAX` | – | `20` | Failed sign-ins per window |
| `STORE_NAME` | – | `Fresh Mart` | Served to the client via `GET /config` |
| `CURRENCY_CODE` | – | `INR` | |
| `CURRENCY_SYMBOL` | – | `₹` | |

The env is validated with Zod at boot. A missing key fails fast with a readable
message instead of surfacing as a mystery 500 on the first checkout.

### Create the store accounts

Credentials belong to Supabase Auth, so they cannot be inserted by `seed.sql`:

```bash
npm run seed:users
```

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@freshmart.test` | `Admin@12345` |
| Staff | `staff@freshmart.test` | `Staff@12345` |

Re-running the script resets those passwords — it is a demo seeder, not a
migration. **Change or remove these accounts before any real deployment.**

After that, admins manage accounts from the app (**Profile → Staff accounts**).

**Turn off public sign-ups:** Supabase dashboard → **Authentication → Sign In /
Providers** → disable **Allow new users to sign up**. The app never uses
self-service sign-up, and the anon key it ships could otherwise be used to
create logins. Since migration 0008 such a login lands as an *inactive* member
of staff with no access (only accounts created through the API, which marks
them in `app_metadata`, start active), but there is no reason to allow them at
all. If sign-ups were open before 0008, review the account list once for
admins you did not create.

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch mode (tsx) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply pending migrations (needs `DATABASE_URL`) |
| `npm run db:seed` | Migrate, then load the demo catalogue |
| `npm run db:status` | Show applied/pending migrations |
| `npm run db:build-setup` | Regenerate `supabase/setup.sql` from the migrations + seed |
| `npm run seed:users` | Create/refresh the demo accounts |

---

## 3 · Mobile app setup

```bash
cd grocery-app/mobile-app
npm install
cp .env.example .env      # optional; see below
npm start                 # opens the Expo dev server
```

### Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `EXPO_PUBLIC_API_URL` | no | Full API base URL. **Leave unset in development** — see below |
| `EXPO_PUBLIC_SUPABASE_URL` | for image upload | Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | for image upload | anon / publishable key |
| `EXPO_PUBLIC_SUPABASE_BUCKET` | no | Defaults to `product-images` |

**On API URL discovery:** `localhost` means *the device itself*, so it only
works in a simulator. When `EXPO_PUBLIC_API_URL` is unset the app reads the Expo
packager's own LAN address from `Constants.expoConfig.hostUri` and points at
port 4000 on the same host — so a phone on the same Wi-Fi just works with no
manual IP editing. Android emulators fall back to `10.0.2.2`. Set the variable
explicitly for a device on another network, or for a deployed API.

Only image bytes go directly to Supabase (Storage enforces the same rules via
the RLS policies in migration 0007). All data access goes through the API.

### Running on a device

```bash
npm start          # then scan the QR code with Expo Go
npm run android    # Android emulator / connected device
npm run ios        # iOS simulator (macOS only)
```

**Android:** install [Expo Go](https://expo.dev/go), scan the QR code from
`npm start`. For an emulator, have it running before `npm run android`.

**iOS:** install Expo Go from the App Store and scan with the Camera app. The
simulator requires Xcode on macOS.

**Barcode scanning needs a real device** — a simulator has no camera. Use the
**Manual** button on the scanner screen to type a barcode when testing on a
simulator; it goes through exactly the same code path as a camera scan.

> Both machines must be on the same network, and the backend must be reachable
> from the phone. If the app shows "Cannot reach the server", check your
> firewall allows inbound connections on port 4000.

### Building standalone binaries

```bash
npm install -g eas-cli
eas login
eas build:configure          # fills in extra.eas.projectId in app.json
eas build --platform android --profile preview   # APK for sideloading
eas build --platform ios --profile preview
```

---

## 4 · Architecture notes

### Authentication

Supabase Auth owns credentials and issues the JWTs; `public.users` owns
everything the store cares about (role, display name, active flag).

- `POST /auth/login` exchanges credentials for a session via the anon client.
- `authenticate` middleware verifies the bearer token with Supabase, then loads
  the profile. Two separate checks on purpose: *is the token valid* is answered
  by Supabase, and *is this still a usable staff account* by `public.users` — so
  deactivating someone takes effect on their next request rather than whenever
  their token happens to expire.
- The mobile client stores tokens in **SecureStore** (iOS Keychain / Android
  Keystore) and refreshes them transparently. A single shared in-flight refresh
  promise means four parallel 401s trigger **one** refresh, not four — otherwise
  three would present an already-rotated refresh token and sign the user out
  mid-shift.

Roles: **admin** manages the catalogue, categories and staff. **staff** runs the
till — scan, cart, checkout, and stock corrections (attributed to them in the
ledger).

### Row Level Security

The backend uses the service-role key, which bypasses RLS; API authorisation is
enforced by its own middleware. The database is the second line of defence, and
it is what governs anything a client does with the anon key the app ships —
including the mobile app's direct Storage uploads:

- **Clients never write application tables.** Since
  [`0008`](supabase/migrations/0008_security_hardening.sql), `anon` and
  `authenticated` hold no insert/update/delete privileges on any of them; the
  API is the only writer. This is what stops a member of staff editing their
  own `role`.
- **Reads** are filtered by the policies in
  [`0006_rls.sql`](supabase/migrations/0006_rls.sql): active staff read the
  catalogue and stock, carts are private to their owner, staff see their own
  orders and admins see all. `anon` reads nothing.
- **Business functions** (`checkout_cart`, `adjust_inventory`,
  `get_or_create_active_cart`, `dashboard_stats`, `sales_trend`) are executable
  by `service_role` only. Postgres grants `EXECUTE` to `PUBLIC` on every new
  function, so revoking from `anon`/`authenticated` by name is not enough —
  0008 revokes from `PUBLIC` too. Any new function must do the same.
- **Roles come from `app_metadata`**, which only the service-role key can write.
  The new-user trigger ignores `user_metadata` (chosen by whoever signs up), and
  only accounts the API marks with `store_account: true` start active.
- A deactivated account loses access on its next API request (the middleware
  checks `public.users`), and `is_admin()` / `is_staff()` stop honouring it in
  RLS and Storage straight away.

### Error handling

One `ApiError` type is thrown deliberately; anything else reaching the handler
is treated as a bug, logged with its stack, and answered with a generic 500.
Postgres failures are translated in
[`supabaseError.ts`](backend/src/utils/supabaseError.ts), including the custom
SQLSTATEs raised by the database functions:

| SQLSTATE | Meaning | HTTP |
|----------|---------|------|
| `ZS001` | Insufficient stock (carries a JSON payload naming the product) | 409 |
| `ZS002` | Cart is empty | 400 |
| `ZS003` | Cart not found or already checked out | 404 |
| `ZS004` | Product missing or inactive | 400 |

That `ZS001` payload is what lets the checkout screen say *"Amul Milk: 2 left but
3 in the cart"* instead of "something went wrong".

### Scanning

A camera fires `onBarcodeScanned` on every frame containing a code — many times
a second, and occasionally with a misread from a blurred frame. The scan gate
([`utils/scanGate.ts`](mobile-app/src/utils/scanGate.ts)) turns that stream into
deliberate scans:

1. **One presentation, one scan.** A code is ignored while it stays in view; the
   1.2 s cooldown restarts on every sighting, so holding a packet in front of
   the camera never adds it twice. Taking it away and presenting it again (or
   the next identical packet) adds another.
2. **Misreads filtered.** Formats without a check digit (Code 39, Codabar) need
   two matching reads in a row.
3. **Nothing lost during a lookup.** One lookup is in flight at a time; a second
   product shown meanwhile is picked up as soon as it finishes.

Scanned text is cleaned of the control characters some scanners add, and the
server matches EAN/UPC codes across formats — iOS reports a UPC-A as a 13-digit
EAN, Android as 12 digits — so the same packet finds the same product on both.

Haptics differ per outcome (added / quantity bumped / unknown or deactivated /
error) and fire only when something actually happened, so the scanner can be
used without watching the screen.

The product form's scan button opens a separate capture screen that only fills
the barcode field — nothing is added to the cart.

### Stock changes

Manual changes carry an idempotency key: a retry after a timeout replays the
first result instead of moving stock twice. **Recount** sets the shelf quantity
and the server computes the change under the row lock, so sales made while the
count screen was open are not undone.

### Money

Cart previews are computed in Node and authoritative order totals in SQL. Both
round half-up to 2 decimals at the same points ([`money.ts`](backend/src/utils/money.ts)
mirrors the `round()` calls in `checkout_cart`), so the number on the checkout
screen always matches the receipt.

---

## 5 · Database schema

```
auth.users ──1:1──> users ──┬──< products ──1:1──> inventory
                            │        │
                            │        └──< inventory_movements
                            │
                            ├──< carts ──< cart_items >── products
                            │
                            └──< orders ──┬──< order_items >── products
                                          └──< payments
                 categories ──< products
```

| Table | Notes |
|-------|-------|
| `users` | Mirrors `auth.users`; auto-created by trigger from sign-up metadata |
| `categories` | Case-insensitive unique name; carries a colour + icon for the UI |
| `products` | **Unique barcode**, unique SKU (case-insensitive), trigram indexes for search |
| `inventory` | One row per product, created by trigger; `quantity >= 0` enforced |
| `inventory_movements` | Append-only ledger; stock is always reproducible by replay |
| `carts` | Partial unique index enforces one active cart per user |
| `cart_items` | Unique `(cart_id, product_id)`; price snapshotted on add |
| `orders` | Sequence-backed `order_number` (`ORD-YYYYMMDD-NNNN`) |
| `order_items` | Product name/barcode/price denormalised so old receipts stay correct |
| `payments` | One-to-many, so split tenders can be added without a migration |

Two decisions worth flagging:

- **Unique barcode is enforced across every row, not just active ones.**
  Deactivating a product must never quietly free its barcode for reuse —
  reactivate the original instead.
- **`order_items` denormalises the product name and price.** A historical
  receipt must keep reading correctly after the product is renamed, repriced, or
  removed from the catalogue.

---

## 6 · Screens

| Screen | Highlights |
|--------|-----------|
| Splash | Restores and revalidates the stored session |
| Login | Gradient hero, inline validation, rate-limit-aware errors |
| Dashboard | Today's sales, 7-day trend, stat tiles, quick actions, low stock, recent orders |
| Product list | Debounced search, category + stock chips, infinite scroll, quick add; admins can switch to deactivated products |
| Product detail | Stock card, identifiers, pricing/margin (admin), recent ledger; deactivate / reactivate (admin) |
| Add/Edit product | Image upload, SKU suggestion, live margin, opening stock |
| Barcode scanner | Live reticle with sweep, torch, haptics, result card, manual entry |
| Cart | Optimistic steppers, stock-limit warnings, docked total |
| Checkout | Payment method picker, discount with cap, optional customer details |
| Order success | Animated confirmation + full itemised receipt |
| Order history | Date-grouped, payment filters, running total |
| Order detail | Receipt, payments, cashier, ledger note |
| Inventory | Tappable health summary, sort modes, filters |
| Stock adjustment | Direction → reason → amount, with a before/after preview |
| Movement history | Date-grouped ledger, filterable by movement type |
| Profile | Edit profile, change password, shortcuts, admin section, sign out |
| Staff accounts (admin) | Create accounts, edit name/phone/role, reset a password, deactivate/reactivate |
| Categories (admin) | Create, rename, recolour, pick an icon, set inactive, delete when unused |

---

## 7 · Sample products for testing

All barcodes are real, check-digit-valid EAN-13 numbers, so a physical scanner
(or a barcode generated from the number) reads them correctly.

| Barcode | Product | Price | Stock | State |
|---------|---------|-------|-------|-------|
| `8901030100000` | Amul Toned Milk 1L | ₹62.00 | 64 | In stock |
| `8901058139594` | Whole Wheat Bread 400g | ₹50.00 | 32 | In stock |
| `8901725179199` | Bananas (Robusta) 1kg | ₹54.00 | 55 | In stock |
| `8904004218787` | Mineral Water 1L | ₹20.00 | 120 | In stock |
| `5449000266293` | Potato Chips 52g | ₹25.00 | 90 | In stock |
| `8901063305892` | Basmati Rice 5kg | ₹695.00 | 12 | In stock |
| `8901030131677` | Cheddar Cheese Slices | ₹139.00 | 4 | **Low stock** |
| `8901725202941` | Baby Spinach 250g | ₹35.00 | 7 | **Low stock** |
| `5449000290052` | Roasted Almonds 200g | ₹299.00 | 3 | **Low stock** |
| `8901063329652` | Sunflower Oil 1L | ₹155.00 | 0 | **Out of stock** |

Scanning `1234567890128` (or any unlisted code) exercises the unknown-barcode
path, which offers to create the product with the barcode pre-filled.

### A quick end-to-end test

1. Sign in as `staff@freshmart.test`.
2. Open **Scan**, scan `8901030100000` — the milk is added, haptic fires.
3. Scan it again after ~2 s — the quantity becomes ×2.
4. Scan `8901063329652` — refused with "out of stock".
5. Scan `8901030131677` — added, with a low-stock warning on the card.
6. Open the cart, adjust a quantity, tap **Proceed to checkout**.
7. Pick **UPI**, add a ₹10 discount, complete the sale.
8. On the success screen check the receipt, then open **Inventory → Milk →
   Full history**: a `sale` movement records `64 → 62`, reason `Order ORD-…`.

---

## 8 · API reference

Full endpoint documentation with request/response examples is in
[`docs/API.md`](docs/API.md).

Every response uses the same envelope:

```jsonc
// success
{ "success": true, "data": { }, "meta": { "page": 1, "total": 30, "hasMore": true } }

// failure
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": { } } }
```

| Group | Endpoints |
|-------|-----------|
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `PATCH /auth/me` · `POST /auth/me/password` · `GET/POST /auth/users` · `PATCH /auth/users/:id` · `PATCH /auth/users/:id/status` · `POST /auth/users/:id/password` |
| Products | `GET /products` · `GET /products/:id` · `GET /products/barcode/:barcode` · `POST /products` · `PATCH /products/:id` · `DELETE /products/:id` · `POST /products/:id/restore` · `GET /products/:id/movements` |
| Categories | `GET /categories` · `GET /categories/:id` · `POST /categories` · `PATCH /categories/:id` · `DELETE /categories/:id` |
| Cart | `GET /cart` · `POST /cart/items` · `PATCH /cart/items/:itemId` · `DELETE /cart/items/:itemId` · `DELETE /cart` |
| Orders | `POST /orders/checkout` · `GET /orders` · `GET /orders/:id` |
| Inventory | `GET /inventory` · `GET /inventory/summary` · `GET /inventory/low-stock` · `GET /inventory/movements` · `GET /inventory/:productId/movements` · `POST /inventory/:productId/adjust` |
| Misc | `GET /config` · `GET /dashboard` · `GET /health` |

---

## 9 · Extending it

The schema and layering were chosen to absorb the obvious next features without
restructuring:

- **Suppliers & purchase orders** — add `suppliers` and `purchase_orders`, then
  reference them from `inventory_movements.reference_type = 'purchase_order'`.
  The ledger already carries a polymorphic reference.
- **Customers & loyalty** — `orders` already holds `customer_name`/`phone`;
  promote them to a `customers` table with a FK.
- **Discounts & promotions** — `orders.discount_amount` exists; add a
  `discounts` table and apply it inside `checkout_cart` so pricing stays atomic.
- **GST / tax configuration** — per-product `tax_rate` is already stored and
  snapshotted onto each line; add a tax-class table and derive the rate.
- **Receipts** — `OrderSuccessScreen` and `OrderDetailScreen` already render a
  complete receipt; add a print/share export.
- **Analytics** — `dashboard_stats()` and `sales_trend()` show the pattern:
  aggregate in SQL, return JSON, one round trip.
- **Multi-store** — add `stores`, then a `store_id` on `products`, `inventory`,
  `orders` and `users`, and extend the RLS policies to scope by it.

---

## 10 · Verification status

What has been checked in this repository:

- ✅ Backend compiles clean (`tsc --noEmit`, including `--noUnusedLocals`)
- ✅ Backend builds to `dist/` and boots; `/health`, `/config`, auth guards,
  validation errors, malformed-JSON handling and 404s verified against a running
  server
- ✅ Mobile app compiles clean (`tsc --noEmit`, including `--noUnusedLocals`)
- ✅ Mobile app bundles for Android via `expo export` (Metro resolves the full
  module graph)
- ✅ `expo-doctor` — 21/21 checks pass
- ✅ Migrations 0001–0008, the seed and `setup.sql` (twice over) executed on
  PostgreSQL 16 with a stand-in for Supabase's roles, `auth` and `storage`
  schemas and default grants. The three holes 0008 closes were reproduced
  first, then shown closed, with the API's service-role path (cart, checkout,
  stock deduction, dashboard) still working.
- ✅ Staff-management endpoints and their guards exercised through the real
  Express stack against an in-memory Supabase client.
- ⚠️ **Not run against a live Supabase project.** End-to-end flows have not been
  executed against a real project, because that needs the service-role key.
  Apply the migrations and run `npm run seed:users`, then walk the test in §7
  to confirm.
