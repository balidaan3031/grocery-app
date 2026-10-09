-- =============================================================================
-- 0008 · Security hardening
--
-- Closes three holes in what a client can reach directly with the anon key the
-- mobile app ships (PostgREST at /rest/v1, Storage at /storage/v1):
--
--   1. Privilege escalation. `users_update_self` let a signed-in user update
--      every column of their own profile — `role` and `is_active` included — so
--      any member of staff could make themselves an admin.
--   2. Self-service admin sign-up. `handle_new_auth_user()` took the role from
--      sign-up metadata, which whoever is signing up controls.
--   3. Callable SECURITY DEFINER functions. Postgres grants EXECUTE on every new
--      function to PUBLIC, and 0006 only revoked it from `anon, authenticated`,
--      so `adjust_inventory` and `checkout_cart` stayed callable through /rpc by
--      anyone holding the anon key — no sign-in needed.
--
-- The model after this migration: the API, using the service-role key, is the
-- only writer of application data. Clients may read through RLS as a signed-in
-- user and upload product images to Storage; nothing else.
--
-- Any table or function added after this one must follow the same rules:
-- revoke client write privileges on new tables, and revoke EXECUTE from PUBLIC
-- (not only from anon/authenticated) on any function a client must not call.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Clients never write application tables directly
--
-- Supabase grants ALL on public tables to anon and authenticated by default and
-- relies on RLS alone. Taking the write privileges away means a policy written
-- too loosely in future cannot reopen this hole on its own.
-- -----------------------------------------------------------------------------
revoke all on table
  public.users,
  public.categories,
  public.products,
  public.inventory,
  public.inventory_movements,
  public.carts,
  public.cart_items,
  public.orders,
  public.order_items,
  public.payments,
  public.products_with_stock,
  public.low_stock_products,
  public.inventory_movement_details,
  public.order_summaries
from anon, authenticated;

-- Signed-in reads stay possible, still filtered row by row by the policies in 0006.
grant select on table
  public.users,
  public.categories,
  public.products,
  public.inventory,
  public.inventory_movements,
  public.carts,
  public.cart_items,
  public.orders,
  public.order_items,
  public.payments,
  public.products_with_stock,
  public.low_stock_products,
  public.inventory_movement_details,
  public.order_summaries
to authenticated;

revoke all on sequence public.order_number_seq from anon, authenticated;

-- The self-update policy is the escalation route itself, and the admin
-- write-everything policy has no remaining use now that clients cannot write.
drop policy if exists users_update_self on public.users;
drop policy if exists users_admin_all   on public.users;

-- The migration runner's ledger lives in public too, so it is exposed through
-- PostgREST like any other table. It only exists when the runner was used.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    execute 'alter table public.schema_migrations enable row level security';
    execute 'revoke all on table public.schema_migrations from anon, authenticated';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2 · Roles come only from the service role
--
-- `raw_app_meta_data` can only be written with the service-role key, unlike
-- `raw_user_meta_data`, which the person signing up chooses. The API marks the
-- accounts it creates with `store_account: true`; anything else — a sign-up
-- made directly against Supabase Auth with the anon key — lands as an inactive
-- member of staff that an admin has to approve before it can do anything.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_provisioned boolean := coalesce(new.raw_app_meta_data ->> 'store_account', '') = 'true';
  v_role        user_role := 'staff';
begin
  if v_provisioned and (new.raw_app_meta_data ->> 'role') in ('admin', 'staff') then
    v_role := (new.raw_app_meta_data ->> 'role')::user_role;
  end if;

  insert into public.users (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_role,
    v_provisioned
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;

-- A deactivated admin keeps a valid JWT until it expires; the role check in
-- RLS and Storage must not keep honouring it in the meantime.
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $fn$
  select role from public.users where id = auth.uid() and is_active;
$fn$;

-- -----------------------------------------------------------------------------
-- 3 · Function execution
--
-- Revoking from PUBLIC is the part 0006 missed: anon and authenticated inherit
-- PUBLIC's grant, so revoking from them by name changed nothing. All five
-- business functions are called only by the API, as service_role.
-- -----------------------------------------------------------------------------
revoke execute on function public.adjust_inventory(uuid, integer, movement_type, text, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.checkout_cart(uuid, uuid, payment_method, numeric, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.get_or_create_active_cart(uuid) from public, anon, authenticated;
revoke execute on function public.dashboard_stats()               from public, anon, authenticated;
revoke execute on function public.sales_trend(integer)            from public, anon, authenticated;

grant execute on function public.adjust_inventory(uuid, integer, movement_type, text, uuid, text, uuid)
  to service_role;
grant execute on function public.checkout_cart(uuid, uuid, payment_method, numeric, text, text, text, text)
  to service_role;
grant execute on function public.get_or_create_active_cart(uuid) to service_role;
grant execute on function public.dashboard_stats()               to service_role;
grant execute on function public.sales_trend(integer)            to service_role;

-- The RLS and Storage helpers only ever run inside policies for signed-in
-- users, so the anonymous role has no reason to call them.
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_admin()          from public, anon;
revoke execute on function public.is_staff()          from public, anon;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_admin()          to authenticated, service_role;
grant execute on function public.is_staff()          to authenticated, service_role;
