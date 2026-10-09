-- =============================================================================
-- 0006 · Row Level Security
--
-- The Node backend talks to Supabase with the service-role key, which bypasses
-- RLS entirely — authorisation for the REST API is enforced by its own
-- middleware. These policies are the second line of defence: they define what
-- an ordinary logged-in user could do if they ever held a user JWT and hit
-- PostgREST or Storage directly (which the mobile app does for image uploads).
--
-- Shape of the rules:
--   · catalogue (products, categories) — everyone reads, admins write
--   · stock (inventory, movements)     — everyone reads, nobody writes directly;
--                                        all mutations go through the SECURITY
--                                        DEFINER functions in 0004
--   · carts                            — strictly private to their owner
--   · orders                           — staff see their own, admins see all
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER is required: a policy on public.users that itself
-- queries public.users would recurse forever otherwise.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $fn$
  select role from public.users where id = auth.uid();
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(public.current_user_role() = 'admin', false);
$fn$;

-- Any active member of staff. Deactivated accounts keep their auth session but
-- lose all data access.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.users
    where id = auth.uid() and is_active
  );
$fn$;

alter table public.users               enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.inventory           enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.carts               enable row level security;
alter table public.cart_items          enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.payments            enable row level security;

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- A user may edit their own profile. The role column is deliberately not
-- protected here at column level — the backend is the only writer that changes
-- roles, and it uses the service key.
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- categories · read for staff, write for admins
-- -----------------------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated using (public.is_staff());

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- products · read for staff, write for admins
-- -----------------------------------------------------------------------------
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated using (public.is_staff());

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- inventory · readable, never directly writable
-- No INSERT/UPDATE/DELETE policy exists, so every write must come through
-- adjust_inventory()/checkout_cart(), which guarantees a matching ledger row.
-- -----------------------------------------------------------------------------
drop policy if exists inventory_select on public.inventory;
create policy inventory_select on public.inventory
  for select to authenticated using (public.is_staff());

drop policy if exists movements_select on public.inventory_movements;
create policy movements_select on public.inventory_movements
  for select to authenticated using (public.is_staff());

-- -----------------------------------------------------------------------------
-- carts · private to their owner
-- -----------------------------------------------------------------------------
drop policy if exists carts_own on public.carts;
create policy carts_own on public.carts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists cart_items_own on public.cart_items;
create policy cart_items_own on public.cart_items
  for all to authenticated
  using (exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id and c.user_id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- orders · own orders for staff, everything for admins. Read-only from the
-- client: orders are only ever created by checkout_cart().
-- -----------------------------------------------------------------------------
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  ));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = payments.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  ));

-- -----------------------------------------------------------------------------
-- Function execution grants
-- -----------------------------------------------------------------------------
grant execute on function public.get_or_create_active_cart(uuid) to authenticated;
grant execute on function public.dashboard_stats()               to authenticated;
grant execute on function public.sales_trend(integer)            to authenticated;

-- checkout_cart and adjust_inventory take a caller-supplied user id, so leaving
-- them executable by `authenticated` would let any user act as another. They
-- stay service-role only; the backend is the sole entry point.
revoke execute on function public.checkout_cart(uuid, uuid, payment_method, numeric, text, text, text, text) from authenticated, anon;
revoke execute on function public.adjust_inventory(uuid, integer, movement_type, text, uuid, text, uuid) from authenticated, anon;
