# API Reference

Base URL: `http://localhost:4000/api/v1` (configurable via `PORT` and `API_PREFIX`).

---

## Conventions

### Response envelope

Every response — success or failure — uses one of two shapes. The mobile client
unwraps exactly one contract, forever.

```jsonc
// 2xx
{
  "success": true,
  "data": { /* payload */ },
  "meta": { /* pagination, only on list endpoints */ }
}

// 4xx / 5xx
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 2 kg of Bananas (Robusta) 1kg left in stock",
    "details": { "productId": "…", "available": 2, "requested": 3 }
  }
}
```

### Authentication

All endpoints except `POST /auth/login`, `POST /auth/refresh`, `GET /config` and
`GET /health` require a bearer token:

```
Authorization: Bearer <accessToken>
```

A `401` with code `UNAUTHORIZED` means the token is missing, invalid or expired.
Clients should attempt one `POST /auth/refresh` and retry.

### Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing / invalid / expired token |
| `FORBIDDEN` | 403 | Authenticated but not permitted (wrong role, or deactivated) |
| `NOT_FOUND` | 404 | Resource does not exist |
| `PRODUCT_NOT_FOUND` | 404 | Barcode lookup missed — carries the barcode in `details` |
| `ROUTE_NOT_FOUND` | 404 | No such endpoint |
| `CONFLICT` | 409 | Unique constraint or state conflict |
| `PRODUCT_INACTIVE` | 409 | Barcode belongs to a deactivated product — carries `{ productId, productName, barcode }`; restore it rather than create another |
| `INSUFFICIENT_STOCK` | 409 | Not enough stock — carries `{ productId, productName, available, requested }` |
| `IDEMPOTENCY_KEY_REUSED` | 409 | An idempotency key was sent again with a different stock change |
| `VALIDATION_ERROR` | 422 | Body/query/params failed validation — `details` is a `{ field, message }[]` |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected failure (details withheld in production) |

### Pagination

List endpoints accept `page` (default `1`) and `limit` (default `20`, max `100`)
and return:

```jsonc
"meta": { "page": 1, "limit": 20, "total": 30, "totalPages": 2, "hasMore": true }
```

### Rate limits

`300` requests/minute per signed-in user (`RATE_LIMIT_MAX`), within a ceiling of
`3000`/minute per client IP (`RATE_LIMIT_IP_MAX`) — every till in a store
usually shares one IP, so the per-IP budget is deliberately the larger one. `20`
**failed** sign-ins per minute on `/auth/login`. Standard `RateLimit-*` headers
are returned.

### Roles

`admin` — full access, including catalogue, categories and staff management.
`staff` — read the catalogue, run the till, adjust stock, see their own orders.

Endpoints marked **admin** return `403` for staff.

---

## Misc

### `GET /health`

Unauthenticated liveness probe. Not under the API prefix.

```jsonc
{ "success": true, "data": { "status": "ok", "uptime": 128.4 } }
```

### `GET /config`

Client bootstrap. Unauthenticated, so the login screen can label prices.

```jsonc
{
  "success": true,
  "data": {
    "storeName": "Fresh Mart",
    "currencyCode": "INR",
    "currencySymbol": "₹",
    "supabaseUrl": "https://xxxx.supabase.co",
    "storageBucket": "product-images"
  }
}
```

### `GET /dashboard`

Everything the home screen needs in one round trip.

**Query:** `trendDays` (1–90, default `7`), `recentLimit` (1–20, default `5`),
`lowStockLimit` (1–20, default `5`)

```jsonc
{
  "success": true,
  "data": {
    "stats": {
      "todaySales": 4820.50, "todayOrders": 14, "totalOrders": 132,
      "totalSales": 84210.00, "totalProducts": 30, "totalCategories": 7,
      "lowStockCount": 3, "outOfStockCount": 1,
      "inventoryUnits": 1042, "inventoryRetailValue": 98420.00, "inventoryCostValue": 74110.00
    },
    "inventory": { "totalProducts": 30, "inStock": 26, "lowStock": 3, "outOfStock": 1,
                   "totalUnits": 1042, "retailValue": 98420.00, "costValue": 74110.00 },
    "recentOrders": [ /* OrderSummary[] */ ],
    "lowStockProducts": [ /* Product[] */ ],
    "salesTrend": [ { "day": "2026-08-21", "total": 3120.00, "orders": 9 } ],
    "generatedAt": "2026-08-27T09:14:02.113Z"
  }
}
```

Staff see their own orders in `recentOrders`; admins see the whole store.

---

## Auth

### `POST /auth/login`

```jsonc
// request
{ "email": "staff@freshmart.test", "password": "Staff@12345" }

// 200
{
  "success": true,
  "data": {
    "user": {
      "id": "…", "email": "staff@freshmart.test", "fullName": "Rahul Verma",
      "role": "staff", "phone": "+91 98200 44556", "avatarUrl": null, "isActive": true
    },
    "session": {
      "accessToken": "eyJ…", "refreshToken": "…",
      "expiresAt": 1787812345, "tokenType": "bearer"
    }
  }
}
```

A wrong password and an unknown email both return `401 UNAUTHORIZED` with the
same message — distinguishing them would turn the endpoint into an account
enumerator. A deactivated account returns `403 FORBIDDEN`.

### `POST /auth/refresh`

```jsonc
// request
{ "refreshToken": "…" }
```

Returns the same `{ user, session }` shape as login.

### `POST /auth/logout`

Revokes the presented token server-side. Returns `204`.

### `GET /auth/me`

Returns the current `AuthenticatedUser`.

### `PATCH /auth/me`

```jsonc
{ "fullName": "Rahul Verma", "phone": "+91 98200 44556", "avatarUrl": null }
```

At least one field is required. Returns the updated user.

### `POST /auth/me/password`

```jsonc
{ "currentPassword": "…", "newPassword": "at-least-8-chars" }
```

Re-authenticates with the current password first, so a stolen access token alone
cannot lock the owner out. Returns `204`.

### `GET /auth/users` — **admin**

Returns every store account.

### `POST /auth/users` — **admin**

```jsonc
{
  "email": "new.staff@freshmart.test",
  "password": "TempPass@123",
  "fullName": "Anita Rao",
  "role": "staff",
  "phone": "+91 98200 77889"
}
```

Returns `201` with the created user, already active. `409 CONFLICT` if the email
exists.

The role is written to the auth user's `app_metadata`, which only the service
role can set; the database ignores a role in `user_metadata`, and any login not
created through this endpoint starts inactive (migration 0008). If the store
profile cannot be created, the auth user is removed again so a retry does not
hit `409`.

### `PATCH /auth/users/:id` — **admin**

```jsonc
{ "fullName": "Anita Rao", "phone": "+91 98200 77889", "role": "admin" }
```

Any subset; at least one field is required. Returns the updated user. You
cannot remove your own admin role (`400`) — together with the rule below, that
guarantees an active admin always remains.

### `PATCH /auth/users/:id/status` — **admin**

```jsonc
{ "isActive": false }
```

Deactivation takes effect on the target's next request. You cannot deactivate
your own account (`400`).

### `POST /auth/users/:id/password` — **admin**

```jsonc
{ "password": "TempPass@456" }
```

Sets a new password for another account (8–72 characters). Returns `204`.
Your own password goes through `POST /auth/me/password`, which requires the
current one (`400` here). Devices already signed in stay signed in —
deactivate the account to cut off access immediately.

---

## Products

### `GET /products`

**Query:** `page`, `limit`, `search`, `categoryId`, `stockStatus`
(`in_stock` \| `low_stock` \| `out_of_stock`), `isActive`,
`sortBy` (`name` \| `created_at` \| `selling_price` \| `quantity`),
`sortOrder` (`asc` \| `desc`)

`search` matches name, SKU and barcode (case-insensitive substring, trigram-indexed).
Inactive products are hidden unless `isActive=false` is passed explicitly — the
till should never surface a discontinued line by accident.

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "…", "name": "Amul Toned Milk 1L",
      "description": "Homogenised toned milk, 1 litre pouch",
      "barcode": "8901030100000", "sku": "DRY-MLK-1L",
      "category_id": "…", "category_name": "Dairy & Eggs",
      "category_color": "#38BDF8", "category_icon": "egg-outline",
      "purchase_price": 52.00, "selling_price": 62.00, "tax_rate": 0.00,
      "unit": "pack", "image_url": null, "low_stock_threshold": 12,
      "is_active": true, "created_at": "…", "updated_at": "…",
      "quantity": 64, "reserved": 0, "last_counted_at": null,
      "stock_status": "in_stock", "stock_retail_value": 3968.00, "margin": 10.00
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 30, "totalPages": 2, "hasMore": true }
}
```

### `GET /products/:id`

Single product, same shape.

### `GET /products/barcode/:barcode`

The scanner's hot path. Returns the product, or:

```jsonc
// 404
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "No product matches barcode 1234567890128",
    "details": { "barcode": "1234567890128" }
  }
}
```

The barcode is echoed back so the client can offer to create the product with
the field pre-filled. A barcode owned by a **deactivated** product answers
`409 PRODUCT_INACTIVE` instead, naming it — creating a second product for that
code would only fail.

**Matching.** Control characters and edge whitespace a scanner adds (GS1
separators, CR/LF) are stripped. Numeric EAN/UPC codes match in any of their
written forms: a UPC-A saved as `036000291452` is found by the 13-digit
`0036000291452` an iPhone camera reports, and vice versa. Other codes must
match exactly. The database enforces the same rule — one product per GTIN, in
any format (migration 0009).

**Saving a barcode** (`POST`/`PATCH /products`): 4–64 letters, digits, `-`,
`.` or `_`, and a numeric 8/12/13/14-digit code must carry a correct check
digit — scanners verify it, so a mistyped one would never scan. A barcode that
another product already owns is refused with `409 CONFLICT`, naming that
product.

### `POST /products` — **admin**

```jsonc
{
  "name": "Amul Toned Milk 1L",
  "description": "Homogenised toned milk, 1 litre pouch",
  "barcode": "8901030100000",
  "sku": "DRY-MLK-1L",
  "categoryId": "…",
  "purchasePrice": 52.00,
  "sellingPrice": 62.00,
  "taxRate": 0,
  "unit": "pack",
  "imageUrl": null,
  "lowStockThreshold": 12,
  "initialQuantity": 64,
  "allowBelowCost": false
}
```

`initialQuantity` is booked as a real `purchase` movement, so opening stock has
a ledger entry explaining where it came from.

Selling below cost is rejected (`422`, on `sellingPrice`) unless
`allowBelowCost: true` — a deliberate loss-leader is a real thing, a typo is
more common. Duplicate barcode or SKU returns `409`. Returns `201`.

### `PATCH /products/:id` — **admin**

Any subset of the create fields, plus `isActive`. Returns the updated product.

### `DELETE /products/:id` — **admin**

Deactivates by default (order history references products, so a hard delete
would orphan receipts).

**Query:** `permanent=true` hard-deletes — refused with `409` once the product
appears on any order.

```jsonc
{ "success": true, "data": { "deleted": false, "product": { /* … */ } } }
```

### `POST /products/:id/restore` — **admin**

Reactivates a deactivated product.

### `GET /products/:id/movements`

The 50 most recent ledger entries for this product (see
[Inventory movements](#get-inventorymovements) for the shape).

---

## Categories

### `GET /categories`

**Query:** `includeInactive`, `withCounts`

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "…", "name": "Dairy & Eggs", "description": "Milk, cheese, butter…",
      "color": "#38BDF8", "icon": "egg-outline", "is_active": true,
      "created_at": "…", "updated_at": "…", "productCount": 5
    }
  ]
}
```

`productCount` is present only with `withCounts=true`, and is computed with one
grouped read rather than a count query per category.

### `GET /categories/:id`

### `POST /categories` — **admin**

```jsonc
{ "name": "Frozen", "description": "Frozen foods", "color": "#38BDF8", "icon": "snow-outline" }
```

`color` must be a hex value; `icon` is an Ionicons glyph name. Names are unique
case-insensitively (`409` on collision). Returns `201`.

### `PATCH /categories/:id` — **admin**

Any subset of the create fields, plus `isActive`.

### `DELETE /categories/:id` — **admin**

Refused with `409` while active products still reference the category —
silently un-categorising a shelf full of stock is rarely what someone means.
Returns `204` on success.

---

## Cart

A cart always belongs to the caller, so there is no cart id in any path. The
active cart is derived from the authenticated user, and created on first use.

### `GET /cart`

```jsonc
{
  "success": true,
  "data": {
    "id": "…", "userId": "…", "status": "active",
    "items": [
      {
        "id": "…", "cart_id": "…", "product_id": "…",
        "quantity": 2, "unit_price": 62.00, "tax_rate": 0.00,
        "product": {
          "id": "…", "name": "Amul Toned Milk 1L", "barcode": "8901030100000",
          "sku": "DRY-MLK-1L", "unit": "pack", "image_url": null,
          "selling_price": 62.00, "quantity": 64, "stock_status": "in_stock"
        },
        "lineSubtotal": 124.00, "lineTax": 0.00, "lineTotal": 124.00,
        "created_at": "…", "updated_at": "…"
      }
    ],
    "totals": {
      "subtotal": 124.00, "taxAmount": 0.00, "total": 124.00,
      "itemCount": 2, "distinctItems": 1
    },
    "createdAt": "…", "updatedAt": "…"
  }
}
```

Live stock is included on each line, which is what lets the cart warn before
checkout fails.

### `POST /cart/items`

```jsonc
// by barcode (scanner)
{ "barcode": "8901030100000", "quantity": 1 }

// by id (tapped from a list)
{ "productId": "…", "quantity": 1 }
```

Exactly one of `productId` / `barcode` is required — accepting both would leave
the server guessing which wins when they disagree.

Re-adding a product **increments** the existing line rather than creating a
second one, as a single atomic upsert (`add_cart_item()`), so two quick scans
of the same item add two units. `unit_price` and `tax_rate` are snapshotted
onto the line, so a price edit made while a customer is at the till cannot
change what they were quoted.

```jsonc
{
  "success": true,
  "data": {
    "cart": { /* full CartDetail */ },
    "product": { /* full Product */ },
    "wasAlreadyInCart": true,
    "quantityInCart": 2
  }
}
```

Returning the cart *and* the product lets the scanner show
"Added · Amul Milk · ×2" plus the running total from a single round trip — no
follow-up fetch between scans.

**Errors:** `404 PRODUCT_NOT_FOUND` (unknown barcode) ·
`409 INSUFFICIENT_STOCK` (requested total exceeds stock) ·
`409 PRODUCT_INACTIVE` (product deactivated — `details` names it)

A deactivated product's barcode is reported as deactivated, not unknown: it
still owns that barcode, so offering to create the product would only end in a
duplicate-barcode `409`.

### `PATCH /cart/items/:itemId`

```jsonc
{ "quantity": 3 }
```

Validated against live stock. Returns the full cart. `409 INSUFFICIENT_STOCK`
if it exceeds what is on the shelf.

### `DELETE /cart/items/:itemId`

Returns the updated cart.

### `DELETE /cart`

Empties the active cart. Returns the (now empty) cart.

---

## Orders

### `POST /orders/checkout`

```jsonc
{
  "cartId": "…",                       // optional; defaults to the active cart
  "paymentMethod": "upi",              // cash | card | upi | other
  "discountAmount": 10.00,             // optional, capped at the total
  "customerName": "Meera S",           // optional
  "customerPhone": "+91 …",            // optional
  "paymentReference": "UPI-88213",     // optional
  "notes": "Regular customer"          // optional
}
```

Runs `checkout_cart()` — one transaction covering stock validation, the order,
its line items, the inventory deductions, the ledger entries, the payment record
and closing the cart. Either all of it commits or none of it does.

Returns `201` with the full order (same shape as `GET /orders/:id`).

**Errors:**

| | |
|---|---|
| `409 INSUFFICIENT_STOCK` | A product ran out — `details` names it with `available` / `requested` |
| `400 BAD_REQUEST` | Cart is empty, or a product went inactive |
| `404 NOT_FOUND` | Cart missing or already checked out |

The stock error is the realistic failure at a busy till: another device sold the
last unit while the customer was queuing.

### `GET /orders`

**Query:** `page`, `limit`, `status`, `paymentMethod`, `from`, `to`, `search`,
`mine`

`search` matches order number and customer name. Staff always see only their own
orders; admins see everything unless `mine=true`.

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "…", "order_number": "ORD-20260827-1042",
      "subtotal": 124.00, "tax_amount": 0.00, "discount_amount": 10.00,
      "total_amount": 114.00, "item_count": 2,
      "status": "completed", "payment_method": "upi", "payment_status": "paid",
      "customer_name": "Meera S", "customer_phone": null, "notes": null,
      "completed_at": "…", "created_at": "…", "updated_at": "…",
      "cashier_name": "Rahul Verma", "cashier_email": "staff@freshmart.test"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 132, "totalPages": 7, "hasMore": true }
}
```

### `GET /orders/:id`

The order plus its items and payments. A staff member requesting another user's
order gets `404`, not `403` — its existence should not be confirmable.

```jsonc
{
  "success": true,
  "data": {
    /* …all OrderSummary fields… */
    "items": [
      {
        "id": "…", "order_id": "…", "product_id": "…",
        "product_name": "Amul Toned Milk 1L", "barcode": "8901030100000",
        "sku": "DRY-MLK-1L", "quantity": 2, "unit_price": 62.00,
        "tax_rate": 0.00, "tax_amount": 0.00, "line_total": 124.00,
        "created_at": "…"
      }
    ],
    "payments": [
      {
        "id": "…", "order_id": "…", "method": "upi", "amount": 114.00,
        "status": "paid", "reference": "UPI-88213", "paid_at": "…"
      }
    ]
  }
}
```

`product_name`, `barcode` and `unit_price` are denormalised onto the line, so an
old receipt keeps reading correctly after the product is renamed, repriced or
removed.

---

## Inventory

### `GET /inventory`

**Query:** `page`, `limit`, `search`, `categoryId`, `stockStatus`,
`sortBy` (`name` \| `quantity` \| `updated_at`), `sortOrder`

Returns `Product[]` — the same shape as `GET /products`, so the UI renders one
row component everywhere.

### `GET /inventory/summary`

```jsonc
{
  "success": true,
  "data": {
    "totalProducts": 30, "inStock": 26, "lowStock": 3, "outOfStock": 1,
    "totalUnits": 1042, "retailValue": 98420.00, "costValue": 74110.00
  }
}
```

One aggregate query (`inventory_summary()`), so the figures are a single
consistent snapshot and stay correct past PostgREST's 1000-row response cap.

### `GET /inventory/low-stock`

**Query:** `limit` (1–100, default `20`)

Restock worklist: out-of-stock first, then closest to the threshold.

### `POST /inventory/:productId/adjust`

```jsonc
{
  "quantityChange": -2,          // signed; must not be zero
  "type": "damage",              // purchase | adjustment | return | damage
  "reason": "Expired stock pulled from shelf",
  "idempotencyKey": "3f1c2a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f"   // optional, recommended
}
```

A signed delta: the ledger records what *changed*. For "the shelf holds N", use
[`/count`](#post-inventoryproductidcount) — a delta worked out by the client is
based on whatever it last loaded, not on the stock at the moment of saving.

The type fixes the direction: `purchase` and `return` only add, `damage` only
removes, `adjustment` goes either way (`422` otherwise). `sale` is **not** an
accepted type — those rows are written by checkout alone, so allowing one here
would let stock leave without an order behind it.

**Idempotency.** Send a fresh UUID per change as `idempotencyKey` (or the
`Idempotency-Key` header) and reuse it when retrying after a timeout or dropped
connection: the change is applied once, and the retry returns the original
movement. The same key with a different change is `409 IDEMPOTENCY_KEY_REUSED`.

Runs `adjust_inventory()`, which locks the row, applies the delta and writes the
ledger entry together. Returns `201` with the created movement:

```jsonc
{
  "success": true,
  "data": {
    "id": "…", "product_id": "…", "type": "damage",
    "quantity_change": -2, "previous_quantity": 20, "new_quantity": 18,
    "reason": "Expired stock pulled from shelf",
    "reference_type": "manual", "reference_id": null,
    "created_by": "…", "created_at": "…"
  }
}
```

`409 INSUFFICIENT_STOCK` if the change would take stock below zero.

### `POST /inventory/:productId/count`

A stock count — the quantity physically on the shelf.

```jsonc
{
  "countedQuantity": 18,         // 0 or more
  "reason": "Monthly stocktake",
  "idempotencyKey": "…"          // optional, as for /adjust
}
```

The server works out the change from the quantity it replaces **while the row
is locked**, so a sale rung up between opening the count and saving it is not
undone by the correction. Recorded as an `adjustment` with
`reference_type: "count"`; a count that matches the record writes no movement
but still stamps `last_counted_at`.

```jsonc
{
  "success": true,
  "data": {
    "changed": true,
    "previousQuantity": 20,
    "newQuantity": 18,
    "movement": { /* the adjustment row, or null when nothing changed */ },
    "replayed": false            // true when an idempotency key answered a retry
  }
}
```

`201` when stock changed, `200` when the count matched or a retry was replayed.

### `GET /inventory/movements`

**Query:** `page`, `limit`, `productId`, `type`, `from`, `to`

The full ledger, newest first, joined for display:

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "…", "product_id": "…",
      "product_name": "Amul Toned Milk 1L", "barcode": "8901030100000",
      "sku": "DRY-MLK-1L", "unit": "pack", "image_url": null,
      "type": "sale", "quantity_change": -2,
      "previous_quantity": 64, "new_quantity": 62,
      "reason": "Order ORD-20260827-1042",
      "reference_type": "order", "reference_id": "…",
      "created_by": "…", "created_by_name": "Rahul Verma",
      "created_at": "…"
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 418, "totalPages": 17, "hasMore": true }
}
```

Movement types: `purchase` (restock) · `sale` · `adjustment` · `return` ·
`damage`.

Rows are append-only — never updated or deleted — so `inventory.quantity` is
always reproducible by replaying this table.

### `GET /inventory/:productId/movements`

The 50 most recent movements for one product.

---

## Product images

Image bytes go **directly from the device to Supabase Storage**, not through
this API: a several-megabyte photo has no reason to occupy an API worker, and
Storage already enforces the same rules via the RLS policies in migration 0007
(public read, staff write, admin delete).

The client uploads with the user's own JWT and then sends the resulting public
URL to `POST /products` or `PATCH /products/:id` as `imageUrl`. The API remains
the only writer of product *data*; only the bytes take the shortcut.

See [`mobile-app/src/services/imageUpload.ts`](../mobile-app/src/services/imageUpload.ts).
