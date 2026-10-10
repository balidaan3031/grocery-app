-- =============================================================================
-- 0010 · Store-local days, and when stock last changed
--
--   1. Supabase runs every session in UTC, so the store's "today" began at
--      05:30 IST: a sale rung up after midnight counted towards the previous
--      day on the dashboard and in the sales trend, and its order number
--      carried the previous day's date. Pinning the time zone on the three
--      functions that work in calendar days fixes them without touching their
--      bodies, or anything else that reads the clock. Stored timestamps are
--      unaffected — they are absolute either way.
--
--      A store in another time zone changes the three zone names below.
--
--   2. The inventory list's "Recent" sort used the product's `updated_at`,
--      which moves when the catalogue entry is edited but not when stock
--      changes. A new view carries the stock row's own timestamp.
--
-- Re-runnable: ALTER FUNCTION ... SET replaces the setting, and the view is
-- CREATE OR REPLACE. Re-running 0004 resets the functions' settings, which is
-- why this file comes after it and setup.sql always replays both.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Store-local calendar days
-- -----------------------------------------------------------------------------
alter function public.dashboard_stats() set timezone = 'Asia/Kolkata';

alter function public.sales_trend(integer) set timezone = 'Asia/Kolkata';

alter function public.checkout_cart(uuid, uuid, payment_method, numeric, text, text, text, text)
  set timezone = 'Asia/Kolkata';

-- -----------------------------------------------------------------------------
-- 2 · inventory_levels: products_with_stock plus when the stock last changed
--
-- A view of its own rather than a new column on products_with_stock: setup.sql
-- replays 0005's CREATE OR REPLACE of that view on every run, and Postgres
-- refuses to drop a column from a view, so widening it would have made the
-- setup script fail the second time it ran.
-- -----------------------------------------------------------------------------
create or replace view public.inventory_levels
with (security_invoker = true)
as
select
  s.*,
  i.updated_at as stock_updated_at
from public.products_with_stock s
left join public.inventory i on i.product_id = s.id;

-- Same access as the views in 0008: no client writes, signed-in reads still
-- filtered by the policies in 0006. The API reads it as service_role.
revoke all on public.inventory_levels from anon, authenticated;
grant select on public.inventory_levels to authenticated;

notify pgrst, 'reload schema';
