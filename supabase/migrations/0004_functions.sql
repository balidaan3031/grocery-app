-- =============================================================================
-- 0004 · Business logic that must be atomic lives in the database
--
-- Checkout and stock adjustment both read-then-write inventory. Doing that from
-- the API layer would race: two tills scanning the last unit could each read
-- quantity = 1 and both sell it. These functions run inside a single
-- transaction and take row locks, so the read and the write cannot be split.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Custom SQLSTATEs. Classes starting I–Z are reserved for user-defined codes,
-- and PostgREST surfaces them to the API as `error.code`, which lets the backend
-- map a domain failure onto the right HTTP status instead of a blanket 500.
--   ZS001 · insufficient stock          -> 409
--   ZS002 · cart is empty               -> 400
--   ZS003 · cart not found / not active -> 404
--   ZS004 · product inactive or missing -> 400
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- adjust_inventory · single source of truth for every stock delta
-- Locks the stock row, applies the change, and writes the ledger entry in one
-- shot so `inventory.quantity` and `inventory_movements` can never disagree.
-- -----------------------------------------------------------------------------
create or replace function public.adjust_inventory(
  p_product_id      uuid,
  p_quantity_change integer,
  p_type            movement_type,
  p_reason          text default null,
  p_user_id         uuid default null,
  p_reference_type  text default null,
  p_reference_id    uuid default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_previous integer;
  v_new      integer;
  v_movement public.inventory_movements;
  v_name     text;
begin
  if p_quantity_change = 0 then
    raise exception 'Stock change must not be zero' using errcode = 'ZS004';
  end if;

  select p.name into v_name
  from public.products p
  where p.id = p_product_id and p.is_active;

  if v_name is null then
    raise exception 'Product not found or inactive' using errcode = 'ZS004';
  end if;

  -- FOR UPDATE serialises concurrent adjustments to the same product.
  select i.quantity into v_previous
  from public.inventory i
  where i.product_id = p_product_id
  for update;

  if v_previous is null then
    insert into public.inventory (product_id, quantity) values (p_product_id, 0)
    on conflict (product_id) do nothing;
    v_previous := 0;
  end if;

  v_new := v_previous + p_quantity_change;

  if v_new < 0 then
    raise exception 'Insufficient stock for %: have %, tried to remove %',
      v_name, v_previous, abs(p_quantity_change)
      using errcode = 'ZS001',
            detail  = json_build_object(
              'productId', p_product_id,
              'productName', v_name,
              'available', v_previous,
              'requested', abs(p_quantity_change)
            )::text;
  end if;

  update public.inventory
  set quantity = v_new,
      last_counted_at = case when p_type = 'adjustment' then now() else last_counted_at end
  where product_id = p_product_id;

  insert into public.inventory_movements (
    product_id, type, quantity_change, previous_quantity, new_quantity,
    reason, reference_type, reference_id, created_by
  )
  values (
    p_product_id, p_type, p_quantity_change, v_previous, v_new,
    p_reason, p_reference_type, p_reference_id, p_user_id
  )
  returning * into v_movement;

  return v_movement;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- get_or_create_active_cart · idempotent, concurrency-safe
-- The partial unique index on carts(user_id) where status='active' turns a lost
-- race into a conflict we can recover from rather than a duplicate cart.
-- -----------------------------------------------------------------------------
create or replace function public.get_or_create_active_cart(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cart_id uuid;
begin
  select id into v_cart_id
  from public.carts
  where user_id = p_user_id and status = 'active'
  limit 1;

  if v_cart_id is not null then
    return v_cart_id;
  end if;

  insert into public.carts (user_id, status)
  values (p_user_id, 'active')
  on conflict (user_id) where status = 'active' do nothing
  returning id into v_cart_id;

  if v_cart_id is null then
    -- Another transaction won the race; adopt its cart.
    select id into v_cart_id
    from public.carts
    where user_id = p_user_id and status = 'active'
    limit 1;
  end if;

  return v_cart_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- checkout_cart · the atomic order pipeline
--
-- Validate stock -> create order -> create order items -> deduct inventory ->
-- record movements -> record payment -> close the cart. Every step shares one
-- transaction: any failure (including a concurrent sale emptying the shelf)
-- rolls the whole thing back, so an order never exists without its stock
-- deduction and stock is never deducted without an order.
-- -----------------------------------------------------------------------------
create or replace function public.checkout_cart(
  p_user_id         uuid,
  p_cart_id         uuid,
  p_payment_method  payment_method default 'cash',
  p_discount_amount numeric default 0,
  p_customer_name   text default null,
  p_customer_phone  text default null,
  p_notes           text default null,
  p_payment_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cart      public.carts;
  v_item      record;
  v_order_id  uuid;
  v_number    text;
  v_subtotal  numeric(12, 2) := 0;
  v_tax       numeric(12, 2) := 0;
  v_total     numeric(12, 2) := 0;
  v_count     integer := 0;
  v_discount  numeric(12, 2) := greatest(coalesce(p_discount_amount, 0), 0);
  v_line_net  numeric(12, 2);
  v_line_tax  numeric(12, 2);
begin
  select * into v_cart
  from public.carts
  where id = p_cart_id and user_id = p_user_id
  for update;

  if v_cart.id is null then
    raise exception 'Cart not found' using errcode = 'ZS003';
  end if;

  if v_cart.status <> 'active' then
    raise exception 'Cart has already been checked out' using errcode = 'ZS003';
  end if;

  if not exists (select 1 from public.cart_items where cart_id = p_cart_id) then
    raise exception 'Cart is empty' using errcode = 'ZS002';
  end if;

  -- Pass 1 · lock every stock row up front, ordered by product_id so two
  -- concurrent checkouts acquire locks in the same sequence and cannot deadlock.
  -- Totals are computed from the same locked snapshot that pass 2 writes to.
  for v_item in
    select ci.product_id,
           ci.quantity,
           ci.unit_price,
           ci.tax_rate,
           p.name  as product_name,
           p.barcode,
           p.sku,
           p.is_active,
           i.quantity as stock
    from public.cart_items ci
    join public.products  p on p.id = ci.product_id
    join public.inventory i on i.product_id = ci.product_id
    where ci.cart_id = p_cart_id
    order by ci.product_id
    for no key update of i
  loop
    if not v_item.is_active then
      raise exception 'Product % is no longer available', v_item.product_name
        using errcode = 'ZS004';
    end if;

    if v_item.stock < v_item.quantity then
      raise exception 'Insufficient stock for %: % available, % requested',
        v_item.product_name, v_item.stock, v_item.quantity
        using errcode = 'ZS001',
              detail  = json_build_object(
                'productId', v_item.product_id,
                'productName', v_item.product_name,
                'available', v_item.stock,
                'requested', v_item.quantity
              )::text;
    end if;

    v_line_net := round(v_item.unit_price * v_item.quantity, 2);
    v_line_tax := round(v_line_net * v_item.tax_rate / 100.0, 2);
    v_subtotal := v_subtotal + v_line_net;
    v_tax      := v_tax + v_line_tax;
    v_count    := v_count + v_item.quantity;
  end loop;

  -- A discount can never turn into a refund.
  v_discount := least(v_discount, v_subtotal + v_tax);
  v_total    := round(v_subtotal + v_tax - v_discount, 2);
  v_number   := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' ||
                lpad(nextval('public.order_number_seq')::text, 4, '0');

  insert into public.orders (
    order_number, user_id, cart_id, subtotal, tax_amount, discount_amount,
    total_amount, item_count, status, payment_method, payment_status,
    customer_name, customer_phone, notes, completed_at
  )
  values (
    v_number, p_user_id, p_cart_id, v_subtotal, v_tax, v_discount,
    v_total, v_count, 'completed', p_payment_method, 'paid',
    p_customer_name, p_customer_phone, p_notes, now()
  )
  returning id into v_order_id;

  -- Pass 2 · write the line items and burn the stock. The rows are still locked
  -- from pass 1, so the quantities validated above are the quantities deducted.
  for v_item in
    select ci.product_id, ci.quantity, ci.unit_price, ci.tax_rate,
           p.name as product_name, p.barcode, p.sku
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = p_cart_id
    order by ci.product_id
  loop
    v_line_net := round(v_item.unit_price * v_item.quantity, 2);
    v_line_tax := round(v_line_net * v_item.tax_rate / 100.0, 2);

    insert into public.order_items (
      order_id, product_id, product_name, barcode, sku,
      quantity, unit_price, tax_rate, tax_amount, line_total
    )
    values (
      v_order_id, v_item.product_id, v_item.product_name, v_item.barcode, v_item.sku,
      v_item.quantity, v_item.unit_price, v_item.tax_rate, v_line_tax, v_line_net + v_line_tax
    );

    perform public.adjust_inventory(
      v_item.product_id,
      -v_item.quantity,
      'sale',
      'Order ' || v_number,
      p_user_id,
      'order',
      v_order_id
    );
  end loop;

  insert into public.payments (order_id, method, amount, status, reference, paid_at)
  values (v_order_id, p_payment_method, v_total, 'paid', p_payment_reference, now());

  -- Closing the cart is what "clears" it: the next get_or_create call opens a
  -- fresh one, while this cart stays queryable as part of the order trail.
  update public.carts set status = 'converted' where id = p_cart_id;
  delete from public.cart_items where cart_id = p_cart_id;

  return v_order_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- dashboard_stats · one round trip instead of seven
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today_start timestamptz := date_trunc('day', now());
begin
  return json_build_object(
    'todaySales', (
      select coalesce(sum(total_amount), 0)::numeric(12, 2)
      from public.orders
      where status = 'completed' and created_at >= v_today_start
    ),
    'todayOrders', (
      select count(*) from public.orders
      where status = 'completed' and created_at >= v_today_start
    ),
    'totalOrders', (
      select count(*) from public.orders where status = 'completed'
    ),
    'totalSales', (
      select coalesce(sum(total_amount), 0)::numeric(12, 2)
      from public.orders where status = 'completed'
    ),
    'totalProducts', (
      select count(*) from public.products where is_active
    ),
    'totalCategories', (
      select count(*) from public.categories where is_active
    ),
    'lowStockCount', (
      select count(*)
      from public.products p
      join public.inventory i on i.product_id = p.id
      where p.is_active and i.quantity > 0 and i.quantity <= p.low_stock_threshold
    ),
    'outOfStockCount', (
      select count(*)
      from public.products p
      join public.inventory i on i.product_id = p.id
      where p.is_active and i.quantity = 0
    ),
    'inventoryUnits', (
      select coalesce(sum(i.quantity), 0)
      from public.inventory i
      join public.products p on p.id = i.product_id
      where p.is_active
    ),
    'inventoryRetailValue', (
      select coalesce(sum(i.quantity * p.selling_price), 0)::numeric(12, 2)
      from public.inventory i
      join public.products p on p.id = i.product_id
      where p.is_active
    ),
    'inventoryCostValue', (
      select coalesce(sum(i.quantity * p.purchase_price), 0)::numeric(12, 2)
      from public.inventory i
      join public.products p on p.id = i.product_id
      where p.is_active
    )
  );
end;
$fn$;

-- -----------------------------------------------------------------------------
-- sales_trend · totals per day for the dashboard chart
-- generate_series fills gaps so a day with no sales still plots as zero.
-- -----------------------------------------------------------------------------
create or replace function public.sales_trend(p_days integer default 7)
returns table (day date, total numeric, orders bigint)
language sql
security definer
set search_path = public
as $fn$
  select d::date as day,
         coalesce(sum(o.total_amount), 0)::numeric(12, 2) as total,
         count(o.id) as orders
  from generate_series(
         date_trunc('day', now()) - ((greatest(p_days, 1) - 1) * interval '1 day'),
         date_trunc('day', now()),
         interval '1 day'
       ) as d
  left join public.orders o
    on o.created_at >= d
   and o.created_at <  d + interval '1 day'
   and o.status = 'completed'
  group by d
  order by d;
$fn$;
