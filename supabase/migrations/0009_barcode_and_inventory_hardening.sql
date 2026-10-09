-- =============================================================================
-- 0009 · Barcode and inventory hardening
--
--   1. One barcode, one product, in any GTIN format. A phone camera reads a
--      UPC-A as 12 digits on Android but as the 13-digit EAN with a leading
--      zero on iOS, so the same packet must be found — and be unique — under
--      either form.
--   2. A movement's type fixes its direction: purchases and returns only add,
--      sales and damage only remove, adjustments go either way.
--   3. A retried stock change applies once. The app sends an idempotency key
--      with every manual change; a resend after a timeout replays the original
--      result instead of moving stock a second time.
--   4. Recounts are absolute. "8 on the shelf" becomes a delta under the row
--      lock, so sales made while the count screen was open cannot skew it.
--   5. Adding to the cart is a single upsert, so two quick scans of the same
--      item add two units instead of the second failing on the unique index.
--   6. The inventory summary is one aggregate instead of every product row
--      shipped to the API, which PostgREST caps at 1000 rows.
--
-- Per 0008: the new table refuses client writes, and the new functions are
-- revoked from PUBLIC and granted to service_role only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Barcode matching key
--
-- Numeric codes of a GTIN length (8, 12, 13, 14 digits) are padded to GTIN-14,
-- which is how GS1 defines them to compare. Anything else — Code 128 shelf
-- labels, internal codes — must match exactly. The backend's
-- src/utils/barcode.ts mirrors this function; the two must change together.
-- -----------------------------------------------------------------------------
create or replace function public.barcode_key(p_barcode text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $fn$
  select case
           when b ~ '^([0-9]{8}|[0-9]{12,14})$' then lpad(b, 14, '0')
           else b
         end
  from (select btrim(p_barcode) as b) as s;
$fn$;

-- Stop with the offending codes named, rather than on an anonymous unique-index
-- error, if the catalogue already holds one product under two formats.
do $$
declare
  v_duplicates text;
begin
  select string_agg(codes, '; ')
  into v_duplicates
  from (
    select string_agg(barcode, ' = ' order by barcode) as codes
    from public.products
    group by public.barcode_key(barcode)
    having count(*) > 1
  ) as clashes;

  if v_duplicates is not null then
    raise exception 'These products share one barcode written in different formats: %. '
                    'Recode or merge them, then re-run the migration.', v_duplicates;
  end if;
end;
$$;

alter table public.products
  add column if not exists barcode_key text generated always as (public.barcode_key(barcode)) stored;

create unique index if not exists products_barcode_key_unique_idx on public.products (barcode_key);

-- The API validates barcodes the same way; this keeps any other writer honest.
-- NOT VALID: enforced on new and changed rows without rechecking legacy data.
alter table public.products drop constraint if exists products_barcode_format_chk;
alter table public.products
  add constraint products_barcode_format_chk
  check (barcode = btrim(barcode) and barcode ~ '^[A-Za-z0-9._-]{4,64}$') not valid;

-- -----------------------------------------------------------------------------
-- 2 · Idempotency keys for manual stock changes
--
-- One row per request key, written in the same transaction as the change it
-- guards, so a key exists if and only if its change happened. It stores the
-- request too: replaying a key with a different product or quantity is refused
-- rather than silently answered with someone else's result.
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_request_keys (
  key               uuid          primary key,
  operation         text          not null check (operation in ('adjust', 'count')),
  product_id        uuid          not null references public.products (id) on delete cascade,
  movement_type     movement_type not null,
  -- The signed change for 'adjust'; the counted total for 'count'.
  quantity          integer       not null,
  -- Null for a count that matched the shelf: nothing moved, but the key still
  -- has to answer a retry.
  movement_id       uuid          references public.inventory_movements (id) on delete set null,
  previous_quantity integer       not null,
  new_quantity      integer       not null,
  created_by        uuid          references public.users (id) on delete set null,
  created_at        timestamptz   not null default now()
);

-- Keys only need to outlive a client's retry window; this index makes pruning
-- old ones (e.g. older than 30 days) cheap.
create index if not exists inventory_request_keys_created_idx on public.inventory_request_keys (created_at);

alter table public.inventory_request_keys enable row level security;
revoke all on table public.inventory_request_keys from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3 · adjust_inventory, now direction-checked and idempotent
--
-- Dropped first: adding a parameter with a default creates an overload, and the
-- old seven-argument version would then make every existing call ambiguous.
-- checkout_cart calls it positionally with seven arguments, which resolves to
-- this version through the default.
-- -----------------------------------------------------------------------------
drop function if exists public.adjust_inventory(uuid, integer, movement_type, text, uuid, text, uuid);

create or replace function public.adjust_inventory(
  p_product_id      uuid,
  p_quantity_change integer,
  p_type            movement_type,
  p_reason          text default null,
  p_user_id         uuid default null,
  p_reference_type  text default null,
  p_reference_id    uuid default null,
  p_idempotency_key uuid default null
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
  v_key      public.inventory_request_keys;
begin
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Stock change must not be zero' using errcode = 'ZS006';
  end if;

  if p_type in ('purchase', 'return') and p_quantity_change < 0 then
    raise exception 'A % can only add stock', p_type using errcode = 'ZS006';
  end if;

  if p_type in ('sale', 'damage') and p_quantity_change > 0 then
    raise exception 'A % can only remove stock', p_type using errcode = 'ZS006';
  end if;

  select p.name into v_name
  from public.products p
  where p.id = p_product_id and p.is_active;

  if v_name is null then
    raise exception 'Product not found or inactive' using errcode = 'ZS004';
  end if;

  -- Make sure the stock row exists, then lock it. The lock serialises every
  -- change to this product — including two deliveries of the same request key,
  -- so the second one reliably sees the first's key below.
  insert into public.inventory (product_id, quantity) values (p_product_id, 0)
  on conflict (product_id) do nothing;

  select i.quantity into v_previous
  from public.inventory i
  where i.product_id = p_product_id
  for update;

  if p_idempotency_key is not null then
    select * into v_key from public.inventory_request_keys where key = p_idempotency_key;

    if found then
      if v_key.operation <> 'adjust'
         or v_key.product_id <> p_product_id
         or v_key.movement_type <> p_type
         or v_key.quantity <> p_quantity_change then
        raise exception 'This request key was already used for a different stock change'
          using errcode = 'ZS005';
      end if;

      select * into v_movement from public.inventory_movements where id = v_key.movement_id;
      return v_movement;
    end if;
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

  if p_idempotency_key is not null then
    insert into public.inventory_request_keys (
      key, operation, product_id, movement_type, quantity,
      movement_id, previous_quantity, new_quantity, created_by
    )
    values (
      p_idempotency_key, 'adjust', p_product_id, p_type, p_quantity_change,
      v_movement.id, v_previous, v_new, p_user_id
    );
  end if;

  return v_movement;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 4 · set_inventory_count · "there are N on the shelf"
--
-- The delta is worked out here, from the quantity the count replaces, while the
-- row is locked. Worked out on the phone it would be based on whatever the
-- screen loaded, and every sale since then would be counted twice.
-- -----------------------------------------------------------------------------
create or replace function public.set_inventory_count(
  p_product_id       uuid,
  p_counted_quantity integer,
  p_reason           text default null,
  p_user_id          uuid default null,
  p_idempotency_key  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_previous integer;
  v_movement public.inventory_movements;
  v_key      public.inventory_request_keys;
  v_name     text;
  v_changed  boolean;
begin
  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'Counted quantity cannot be negative' using errcode = 'ZS006';
  end if;

  select p.name into v_name
  from public.products p
  where p.id = p_product_id and p.is_active;

  if v_name is null then
    raise exception 'Product not found or inactive' using errcode = 'ZS004';
  end if;

  insert into public.inventory (product_id, quantity) values (p_product_id, 0)
  on conflict (product_id) do nothing;

  select i.quantity into v_previous
  from public.inventory i
  where i.product_id = p_product_id
  for update;

  if p_idempotency_key is not null then
    select * into v_key from public.inventory_request_keys where key = p_idempotency_key;

    if found then
      if v_key.operation <> 'count'
         or v_key.product_id <> p_product_id
         or v_key.quantity <> p_counted_quantity then
        raise exception 'This request key was already used for a different stock change'
          using errcode = 'ZS005';
      end if;

      if v_key.movement_id is not null then
        select * into v_movement from public.inventory_movements where id = v_key.movement_id;
      end if;

      return jsonb_build_object(
        'changed', v_key.movement_id is not null,
        'previousQuantity', v_key.previous_quantity,
        'newQuantity', v_key.new_quantity,
        'movement', case when v_key.movement_id is null then null else to_jsonb(v_movement) end,
        'replayed', true
      );
    end if;
  end if;

  v_changed := p_counted_quantity <> v_previous;

  if v_changed then
    -- Same transaction and the lock is already held, so this cannot interleave.
    v_movement := public.adjust_inventory(
      p_product_id,
      p_counted_quantity - v_previous,
      'adjustment',
      p_reason,
      p_user_id,
      'count',
      null,
      null
    );
  else
    -- Nothing moved, but the shelf was counted, which is worth recording.
    update public.inventory set last_counted_at = now() where product_id = p_product_id;
  end if;

  if p_idempotency_key is not null then
    insert into public.inventory_request_keys (
      key, operation, product_id, movement_type, quantity,
      movement_id, previous_quantity, new_quantity, created_by
    )
    values (
      p_idempotency_key, 'count', p_product_id, 'adjustment', p_counted_quantity,
      case when v_changed then v_movement.id end, v_previous, p_counted_quantity, p_user_id
    );
  end if;

  return jsonb_build_object(
    'changed', v_changed,
    'previousQuantity', v_previous,
    'newQuantity', p_counted_quantity,
    'movement', case when v_changed then to_jsonb(v_movement) else null end,
    'replayed', false
  );
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 5 · add_cart_item · one scan, one atomic upsert
--
-- Reading the line and then inserting or updating it from the API raced: two
-- quick scans of one item both saw no line, both inserted, and the second hit
-- cart_items_unique_product. The upsert adds to whatever is there at commit.
-- The stock check here is advisory — checkout re-checks under lock — but it
-- keeps the cashier from ringing up more than the shelf holds.
-- -----------------------------------------------------------------------------
create or replace function public.add_cart_item(
  p_user_id    uuid,
  p_product_id uuid,
  p_quantity   integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_product  public.products;
  v_cart_id  uuid;
  v_stock    integer;
  v_quantity integer;
  v_inserted boolean;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1' using errcode = 'ZS006';
  end if;

  select * into v_product from public.products where id = p_product_id;

  if v_product.id is null or not v_product.is_active then
    raise exception 'Product not found or inactive' using errcode = 'ZS004';
  end if;

  -- Checkout locks the cart row too, so a scan cannot land in a cart that is
  -- being turned into an order. If checkout won, the next attempt gets the
  -- fresh cart that replaces it.
  for attempt in 1..2 loop
    v_cart_id := public.get_or_create_active_cart(p_user_id);
    perform 1 from public.carts where id = v_cart_id and status = 'active' for update;
    exit when found;
    v_cart_id := null;
  end loop;

  if v_cart_id is null then
    raise exception 'Could not open a cart, please retry' using errcode = 'ZS003';
  end if;

  select coalesce(i.quantity, 0) into v_stock
  from public.inventory i
  where i.product_id = p_product_id;

  v_stock := coalesce(v_stock, 0);

  insert into public.cart_items as ci (cart_id, product_id, quantity, unit_price, tax_rate)
  values (v_cart_id, p_product_id, p_quantity, v_product.selling_price, v_product.tax_rate)
  on conflict (cart_id, product_id) do update
    set quantity   = ci.quantity + excluded.quantity,
        unit_price = excluded.unit_price,
        tax_rate   = excluded.tax_rate
  returning ci.quantity, (ci.xmax = 0) into v_quantity, v_inserted;

  if v_quantity > v_stock then
    raise exception '%',
      case
        when v_stock <= 0 then format('%s is out of stock', v_product.name)
        else format('Only %s %s of %s left in stock', v_stock, v_product.unit, v_product.name)
      end
      using errcode = 'ZS001',
            detail  = json_build_object(
              'productId', p_product_id,
              'productName', v_product.name,
              'available', greatest(v_stock, 0),
              'requested', v_quantity
            )::text;
  end if;

  return jsonb_build_object(
    'cartId', v_cart_id,
    'quantityInCart', v_quantity,
    'wasAlreadyInCart', not v_inserted
  );
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 6 · inventory_summary · one consistent snapshot
-- The bands match products_with_stock.stock_status exactly.
-- -----------------------------------------------------------------------------
create or replace function public.inventory_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'totalProducts', count(*),
    'inStock',       count(*) filter (where coalesce(i.quantity, 0) > p.low_stock_threshold),
    'lowStock',      count(*) filter (where coalesce(i.quantity, 0) > 0
                                        and coalesce(i.quantity, 0) <= p.low_stock_threshold),
    'outOfStock',    count(*) filter (where coalesce(i.quantity, 0) = 0),
    'totalUnits',    coalesce(sum(coalesce(i.quantity, 0)), 0),
    'retailValue',   round(coalesce(sum(coalesce(i.quantity, 0) * p.selling_price), 0), 2),
    'costValue',     round(coalesce(sum(coalesce(i.quantity, 0) * p.purchase_price), 0), 2)
  )
  from public.products p
  left join public.inventory i on i.product_id = p.id
  where p.is_active;
$fn$;

-- -----------------------------------------------------------------------------
-- 7 · Function execution (see 0008 §3)
-- barcode_key stays callable: it is a pure helper behind a generated column.
-- -----------------------------------------------------------------------------
revoke execute on function public.adjust_inventory(uuid, integer, movement_type, text, uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.set_inventory_count(uuid, integer, text, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.add_cart_item(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.inventory_summary()                from public, anon, authenticated;

grant execute on function public.adjust_inventory(uuid, integer, movement_type, text, uuid, text, uuid, uuid)
  to service_role;
grant execute on function public.set_inventory_count(uuid, integer, text, uuid, uuid) to service_role;
grant execute on function public.add_cart_item(uuid, uuid, integer) to service_role;
grant execute on function public.inventory_summary()                to service_role;

-- PostgREST only learns about new functions and columns on a schema reload.
notify pgrst, 'reload schema';
