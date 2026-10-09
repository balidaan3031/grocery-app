-- =============================================================================
-- 0005 · Read models
--
-- `security_invoker = true` makes each view run under the querying role, so the
-- RLS policies in 0006 still apply. Without it a view would silently bypass
-- them, because a view otherwise executes as its owner.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- products_with_stock · the shape every product list in the app renders
-- Bundles the catalogue row, its category, live stock, and a derived status the
-- client can colour-code directly instead of recomputing the thresholds.
-- -----------------------------------------------------------------------------
create or replace view public.products_with_stock
with (security_invoker = true)
as
select
  p.id,
  p.name,
  p.description,
  p.barcode,
  p.sku,
  p.category_id,
  c.name  as category_name,
  c.color as category_color,
  c.icon  as category_icon,
  p.purchase_price,
  p.selling_price,
  p.tax_rate,
  p.unit,
  p.image_url,
  p.low_stock_threshold,
  p.is_active,
  p.created_by,
  p.created_at,
  p.updated_at,
  coalesce(i.quantity, 0) as quantity,
  coalesce(i.reserved, 0) as reserved,
  i.last_counted_at,
  case
    when coalesce(i.quantity, 0) = 0                        then 'out_of_stock'
    when coalesce(i.quantity, 0) <= p.low_stock_threshold   then 'low_stock'
    else 'in_stock'
  end as stock_status,
  round(coalesce(i.quantity, 0) * p.selling_price, 2) as stock_retail_value,
  round(p.selling_price - p.purchase_price, 2)        as margin
from public.products p
left join public.categories c on c.id = p.category_id
left join public.inventory  i on i.product_id = p.id;

-- -----------------------------------------------------------------------------
-- low_stock_products · restock worklist, most urgent first
-- -----------------------------------------------------------------------------
create or replace view public.low_stock_products
with (security_invoker = true)
as
select *
from public.products_with_stock
where is_active and stock_status in ('low_stock', 'out_of_stock')
order by quantity asc, name asc;

-- -----------------------------------------------------------------------------
-- inventory_movement_details · the audit trail, joined for display
-- -----------------------------------------------------------------------------
create or replace view public.inventory_movement_details
with (security_invoker = true)
as
select
  m.id,
  m.product_id,
  p.name    as product_name,
  p.barcode,
  p.sku,
  p.unit,
  p.image_url,
  m.type,
  m.quantity_change,
  m.previous_quantity,
  m.new_quantity,
  m.reason,
  m.reference_type,
  m.reference_id,
  m.created_by,
  u.full_name as created_by_name,
  m.created_at
from public.inventory_movements m
join public.products p on p.id = m.product_id
left join public.users u on u.id = m.created_by;

-- -----------------------------------------------------------------------------
-- order_summaries · order header plus who rang it up
-- -----------------------------------------------------------------------------
create or replace view public.order_summaries
with (security_invoker = true)
as
select
  o.*,
  u.full_name as cashier_name,
  u.email     as cashier_email
from public.orders o
left join public.users u on u.id = o.user_id;
