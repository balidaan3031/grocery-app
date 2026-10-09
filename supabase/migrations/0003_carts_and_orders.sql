-- =============================================================================
-- 0003 · Carts, orders, payments
-- =============================================================================

-- -----------------------------------------------------------------------------
-- carts · one open cart per user at a time
-- -----------------------------------------------------------------------------
create table if not exists public.carts (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  status     cart_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The partial unique index is what makes "get or create the active cart" safe
-- under concurrency: two parallel requests cannot both create one.
create unique index if not exists carts_one_active_per_user_idx
  on public.carts (user_id) where status = 'active';
create index if not exists carts_user_idx on public.carts (user_id, created_at desc);

drop trigger if exists carts_set_updated_at on public.carts;
create trigger carts_set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- cart_items
-- unit_price is snapshotted on add so a mid-transaction price edit cannot change
-- what the customer was quoted at the counter.
-- -----------------------------------------------------------------------------
create table if not exists public.cart_items (
  id         uuid        primary key default gen_random_uuid(),
  cart_id    uuid        not null references public.carts (id) on delete cascade,
  product_id uuid        not null references public.products (id) on delete cascade,
  quantity   integer     not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  tax_rate   numeric(5, 2)  not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_unique_product unique (cart_id, product_id)
);

create index if not exists cart_items_cart_idx on public.cart_items (cart_id);

drop trigger if exists cart_items_set_updated_at on public.cart_items;
create trigger cart_items_set_updated_at before update on public.cart_items
  for each row execute function public.set_updated_at();

-- Touch the parent cart whenever its contents change, so "most recent cart"
-- ordering and stale-cart cleanup both work off carts.updated_at alone.
create or replace function public.touch_parent_cart()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.carts set updated_at = now()
  where id = coalesce(new.cart_id, old.cart_id);
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists cart_items_touch_cart on public.cart_items;
create trigger cart_items_touch_cart after insert or update or delete on public.cart_items
  for each row execute function public.touch_parent_cart();

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1000;

create table if not exists public.orders (
  id              uuid           primary key default gen_random_uuid(),
  order_number    text           not null unique,
  user_id         uuid           references public.users (id) on delete set null,
  cart_id         uuid           references public.carts (id) on delete set null,
  subtotal        numeric(12, 2) not null default 0 check (subtotal >= 0),
  tax_amount      numeric(12, 2) not null default 0 check (tax_amount >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  total_amount    numeric(12, 2) not null default 0 check (total_amount >= 0),
  item_count      integer        not null default 0 check (item_count >= 0),
  status          order_status   not null default 'completed',
  payment_method  payment_method not null default 'cash',
  payment_status  payment_status not null default 'paid',
  customer_name   text,
  customer_phone  text,
  notes           text,
  completed_at    timestamptz,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now()
);

create index if not exists orders_user_idx    on public.orders (user_id, created_at desc);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status);
create index if not exists orders_number_idx  on public.orders (order_number);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- order_items
-- Product name/barcode/price are denormalised on purpose: a historical receipt
-- must keep reading correctly even after the product is renamed, repriced, or
-- removed from the catalogue.
-- -----------------------------------------------------------------------------
create table if not exists public.order_items (
  id           uuid           primary key default gen_random_uuid(),
  order_id     uuid           not null references public.orders (id) on delete cascade,
  product_id   uuid           references public.products (id) on delete set null,
  product_name text           not null,
  barcode      text,
  sku          text,
  quantity     integer        not null check (quantity > 0),
  unit_price   numeric(12, 2) not null check (unit_price >= 0),
  tax_rate     numeric(5, 2)  not null default 0,
  tax_amount   numeric(12, 2) not null default 0,
  line_total   numeric(12, 2) not null check (line_total >= 0),
  created_at   timestamptz    not null default now()
);

create index if not exists order_items_order_idx   on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- -----------------------------------------------------------------------------
-- payments · one row per tender against an order
-- Modelled one-to-many so split payments can be added later without migration.
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id         uuid           primary key default gen_random_uuid(),
  order_id   uuid           not null references public.orders (id) on delete cascade,
  method     payment_method not null,
  amount     numeric(12, 2) not null check (amount >= 0),
  status     payment_status not null default 'paid',
  reference  text,
  paid_at    timestamptz,
  created_at timestamptz    not null default now(),
  updated_at timestamptz    not null default now()
);

create index if not exists payments_order_idx on public.payments (order_id);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
