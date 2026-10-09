-- =============================================================================
-- 0002 · Users, categories, products, inventory, inventory ledger
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users · application profile mirroring auth.users
-- Supabase Auth owns credentials; this table owns everything the store cares
-- about (role, display name, active flag).
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       citext      not null unique,
  full_name   text        not null default '',
  role        user_role   not null default 'staff',
  phone       text,
  avatar_url  text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role) where is_active;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- Provision a profile row automatically whenever Supabase Auth creates a user.
-- Role/name come from the sign-up metadata so the backend can create a staff
-- account in a single admin API call.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  color       text        not null default '#10B981',  -- accent used by the mobile UI
  icon        text        not null default 'basket-outline',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Case-insensitive uniqueness: "Dairy" and "dairy" are the same aisle.
create unique index if not exists categories_name_unique_idx on public.categories (lower(name));
create index if not exists categories_active_idx on public.categories (is_active);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  name                text        not null,
  description         text,
  barcode             text        not null,
  sku                 text        not null,
  category_id         uuid        references public.categories (id) on delete set null,
  purchase_price      numeric(12, 2) not null default 0 check (purchase_price >= 0),
  selling_price       numeric(12, 2) not null check (selling_price >= 0),
  tax_rate            numeric(5, 2)  not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  unit                text        not null default 'pcs',
  image_url           text,
  low_stock_threshold integer     not null default 10 check (low_stock_threshold >= 0),
  is_active           boolean     not null default true,
  created_by          uuid        references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- A barcode identifies exactly one product, and an SKU exactly one product.
-- Enforced across every row (not only active ones) so deactivating a product
-- never quietly frees its barcode for reuse — reactivate the original instead.
create unique index if not exists products_barcode_unique_idx on public.products (barcode);
create unique index if not exists products_sku_unique_idx     on public.products (upper(sku));

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_active_idx   on public.products (is_active);
create index if not exists products_created_idx  on public.products (created_at desc);
-- Trigram indexes keep substring search off a sequential scan as the catalogue grows.
create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create index if not exists products_sku_trgm_idx  on public.products using gin (sku gin_trgm_ops);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- inventory · exactly one stock row per product
-- Split out from `products` so stock writes never contend with catalogue edits
-- and so a single row can be locked during checkout.
-- -----------------------------------------------------------------------------
create table if not exists public.inventory (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid        not null unique references public.products (id) on delete cascade,
  quantity        integer     not null default 0 check (quantity >= 0),
  -- Reserved for a future "held for a pending order" flow; always 0 today.
  reserved        integer     not null default 0 check (reserved >= 0),
  last_counted_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists inventory_quantity_idx on public.inventory (quantity);

drop trigger if exists inventory_set_updated_at on public.inventory;
create trigger inventory_set_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();

-- Every product gets a stock row the moment it is created.
create or replace function public.handle_new_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.inventory (product_id, quantity)
  values (new.id, 0)
  on conflict (product_id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_product_created on public.products;
create trigger on_product_created after insert on public.products
  for each row execute function public.handle_new_product();

-- -----------------------------------------------------------------------------
-- inventory_movements · append-only ledger
-- Rows are never updated or deleted; the running total in `inventory` is always
-- reproducible by replaying this table.
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid          not null references public.products (id) on delete cascade,
  type              movement_type not null,
  quantity_change   integer       not null check (quantity_change <> 0),
  previous_quantity integer       not null check (previous_quantity >= 0),
  new_quantity      integer       not null check (new_quantity >= 0),
  reason            text,
  reference_type    text,          -- e.g. 'order'
  reference_id      uuid,          -- e.g. orders.id
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz   not null default now()
);

create index if not exists movements_product_idx   on public.inventory_movements (product_id, created_at desc);
create index if not exists movements_created_idx   on public.inventory_movements (created_at desc);
create index if not exists movements_type_idx      on public.inventory_movements (type);
create index if not exists movements_reference_idx on public.inventory_movements (reference_type, reference_id);
