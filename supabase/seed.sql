-- =============================================================================
-- seed.sql · demo catalogue for local development and testing
--
-- Safe to run more than once: every statement is guarded by ON CONFLICT or a
-- freshness check, so re-running will not duplicate rows or double stock.
--
-- Barcodes are real, check-digit-valid EAN-13 numbers, so a physical scanner
-- (or a printed/on-screen barcode) reads them correctly during testing.
--
-- Staff accounts are NOT seeded here — Supabase Auth owns credentials. Create
-- them with:  npm run seed:users --prefix backend
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categories
-- -----------------------------------------------------------------------------
insert into public.categories (name, description, color, icon) values
  ('Fruits & Vegetables', 'Fresh produce, sold by weight or piece', '#22C55E', 'nutrition-outline'),
  ('Dairy & Eggs',        'Milk, cheese, butter, yoghurt and eggs',  '#38BDF8', 'egg-outline'),
  ('Bakery',              'Bread, buns and everyday baked goods',    '#F59E0B', 'pizza-outline'),
  ('Beverages',           'Water, juices, soft and hot drinks',      '#06B6D4', 'wine-outline'),
  ('Snacks',              'Biscuits, chips, chocolate and namkeen',  '#F97316', 'fast-food-outline'),
  ('Staples & Grains',    'Rice, flour, pulses, sugar and oils',     '#8B5CF6', 'basket-outline'),
  ('Household',           'Cleaning, laundry and paper goods',       '#64748B', 'home-outline')
on conflict (lower(name)) do nothing;

-- -----------------------------------------------------------------------------
-- Products
-- Prices are in whole currency units (₹ by default — see CURRENCY in the env).
-- -----------------------------------------------------------------------------
insert into public.products
  (name, description, barcode, sku, category_id, purchase_price, selling_price, tax_rate, unit, low_stock_threshold)
select
  s.name, s.description, s.barcode, s.sku, c.id,
  s.purchase_price, s.selling_price, s.tax_rate, s.unit, s.threshold
from (values
  -- name                        description                                  barcode          sku          category               buy      sell     tax    unit    low
  ('Amul Toned Milk 1L',        'Homogenised toned milk, 1 litre pouch',      '8901030100000', 'DRY-MLK-1L', 'Dairy & Eggs',        52.00,   62.00,  0.00,  'pack',  12),
  ('Farm Eggs (Tray of 6)',     'Free-range brown eggs, tray of six',         '8901030107917', 'DRY-EGG-06', 'Dairy & Eggs',        48.00,   66.00,  0.00,  'tray',  10),
  ('Amul Butter 500g',          'Pasteurised salted table butter',            '8901030115837', 'DRY-BTR-500','Dairy & Eggs',       245.00,  285.00,  5.00,  'pack',   6),
  ('Greek Yoghurt 400g',        'Thick set curd, no added sugar',             '8901030123757', 'DRY-YOG-400','Dairy & Eggs',        62.00,   85.00,  5.00,  'cup',    8),
  ('Cheddar Cheese Slices',     'Processed cheddar, 10 slices',               '8901030131677', 'DRY-CHS-10', 'Dairy & Eggs',       105.00,  139.00, 12.00,  'pack',   6),

  ('Whole Wheat Bread 400g',    'Soft sandwich loaf, baked daily',            '8901058139594', 'BAK-BRD-400','Bakery',              38.00,   50.00,  5.00,  'loaf',  10),
  ('Butter Croissant',          'All-butter flaky croissant',                 '8901058147513', 'BAK-CRS-01', 'Bakery',              22.00,   45.00,  5.00,  'pcs',   12),
  ('Multigrain Buns (Pack 6)',  'Six seeded burger buns',                     '8901058155433', 'BAK-BUN-06', 'Bakery',              34.00,   55.00,  5.00,  'pack',   8),
  ('Chocolate Muffin',          'Double chocolate muffin, single serve',      '8901058163353', 'BAK-MUF-01', 'Bakery',              25.00,   49.00, 12.00,  'pcs',   10),
  ('Rusk Toast 300g',           'Crisp cardamom rusk',                        '8901058171273', 'BAK-RSK-300','Bakery',              32.00,   48.00,  5.00,  'pack',   8),

  ('Bananas (Robusta) 1kg',     'Ripe robusta bananas, per kilo',             '8901725179199', 'FRV-BAN-1K', 'Fruits & Vegetables', 32.00,   54.00,  0.00,  'kg',    15),
  ('Tomatoes 1kg',              'Fresh local tomatoes, per kilo',             '8901725187101', 'FRV-TOM-1K', 'Fruits & Vegetables', 24.00,   42.00,  0.00,  'kg',    20),
  ('Onions 1kg',                'Red onions, per kilo',                       '8901725195021', 'FRV-ONI-1K', 'Fruits & Vegetables', 22.00,   38.00,  0.00,  'kg',    20),
  ('Baby Spinach 250g',         'Washed and ready-to-cook spinach',           '8901725202941', 'FRV-SPN-250','Fruits & Vegetables', 18.00,   35.00,  0.00,  'pack',  10),
  ('Royal Gala Apples 1kg',     'Crisp imported gala apples',                 '8901725210861', 'FRV-APL-1K', 'Fruits & Vegetables',118.00,  169.00,  0.00,  'kg',    10),

  ('Mineral Water 1L',          'Packaged drinking water',                    '8904004218787', 'BEV-WTR-1L', 'Beverages',            9.00,   20.00, 12.00,  'bottle',24),
  ('Orange Juice 1L',           'No-added-sugar orange juice',                '8904004226706', 'BEV-JUS-1L', 'Beverages',           88.00,  125.00, 12.00,  'carton',10),
  ('Green Tea (25 Bags)',       'Pure green tea bags, box of 25',             '8904004234626', 'BEV-TEA-25', 'Beverages',          142.00,  199.00, 18.00,  'box',    6),
  ('Filter Coffee Powder 200g', 'Roast and ground filter coffee',             '8904004242546', 'BEV-COF-200','Beverages',          178.00,  245.00, 18.00,  'pack',   6),
  ('Cola 750ml',                'Chilled carbonated soft drink',              '5449000258380', 'BEV-COL-750','Beverages',           28.00,   45.00, 28.00,  'bottle',18),

  ('Potato Chips 52g',          'Classic salted potato crisps',               '5449000266293', 'SNK-CHP-52', 'Snacks',              14.00,   25.00, 12.00,  'pack',  20),
  ('Marie Biscuits 250g',       'Light tea biscuits',                         '5449000274212', 'SNK-BIS-250','Snacks',              26.00,   40.00, 18.00,  'pack',  15),
  ('Dark Chocolate 80g',        '55% cocoa dark chocolate bar',               '5449000282132', 'SNK-CHO-80', 'Snacks',              78.00,  110.00, 18.00,  'bar',   10),
  ('Roasted Almonds 200g',      'Lightly salted roasted almonds',             '5449000290052', 'SNK-ALM-200','Snacks',             218.00,  299.00, 12.00,  'pack',   6),
  ('Mixed Namkeen 200g',        'Traditional savoury mix',                    '8901063297975', 'SNK-NMK-200','Snacks',              42.00,   65.00, 12.00,  'pack',  12),

  ('Basmati Rice 5kg',          'Aged long-grain basmati',                    '8901063305892', 'STP-RIC-5K', 'Staples & Grains',   540.00,  695.00,  5.00,  'bag',    5),
  ('Atta Whole Wheat 5kg',      'Chakki-fresh whole wheat flour',             '8901063313811', 'STP-ATA-5K', 'Staples & Grains',   225.00,  289.00,  5.00,  'bag',    6),
  ('Toor Dal 1kg',              'Split pigeon peas',                          '8901063321731', 'STP-DAL-1K', 'Staples & Grains',   132.00,  178.00,  5.00,  'pack',   8),
  ('Sunflower Oil 1L',          'Refined sunflower cooking oil',              '8901063329652', 'STP-OIL-1L', 'Staples & Grains',   118.00,  155.00,  5.00,  'bottle',10),
  ('Iodised Salt 1kg',          'Free-flowing iodised table salt',            '8904004250466', 'STP-SLT-1K', 'Staples & Grains',    16.00,   28.00,  5.00,  'pack',  12)
) as s(name, description, barcode, sku, category, purchase_price, selling_price, tax_rate, unit, threshold)
join public.categories c on lower(c.name) = lower(s.category)
on conflict (barcode) do nothing;

-- -----------------------------------------------------------------------------
-- Opening stock
-- Routed through adjust_inventory() rather than a plain UPDATE so the seeded
-- quantities arrive with a matching ledger entry, exactly like real restocking.
-- The `i.quantity = 0` guard makes a second run a no-op.
-- -----------------------------------------------------------------------------
do $seed$
declare
  r record;
begin
  for r in
    select p.id as product_id, v.qty
    from (values
      ('8901030100000', 64), ('8901030107917', 40), ('8901030115837', 18),
      ('8901030123757', 26), ('8901030131677',  4),
      ('8901058139594', 32), ('8901058147513', 24), ('8901058155433', 15),
      ('8901058163353',  6), ('8901058171273', 21),
      ('8901725179199', 55), ('8901725187101', 48), ('8901725195021', 62),
      ('8901725202941',  7), ('8901725210861', 28),
      ('8904004218787',120), ('8904004226706', 22), ('8904004234626',  9),
      ('8904004242546', 14), ('5449000258380', 76),
      ('5449000266293', 90), ('5449000274212', 44), ('5449000282132', 31),
      ('5449000290052',  3), ('8901063297975', 38),
      ('8901063305892', 12), ('8901063313811', 19), ('8901063321731', 27),
      ('8901063329652', 33), ('8904004250466', 41)
    ) as v(barcode, qty)
    join public.products  p on p.barcode = v.barcode
    join public.inventory i on i.product_id = p.id
    where i.quantity = 0
  loop
    perform public.adjust_inventory(
      r.product_id, r.qty, 'purchase', 'Opening stock (seed)', null, 'seed', null
    );
  end loop;
end;
$seed$;

-- One product is left deliberately out of stock so the out-of-stock UI state is
-- visible without having to sell anything first. The write-off is derived from
-- the product's actual quantity rather than a hard-coded number, and guarded on
-- its own ledger entry so a second run is a no-op.
do $demo$
declare
  r record;
begin
  for r in
    select p.id as product_id, i.quantity
    from public.products p
    join public.inventory i on i.product_id = p.id
    where p.barcode = '8901063329652'
      and i.quantity > 0
      and not exists (
        select 1 from public.inventory_movements m
        where m.product_id = p.id and m.reason = 'Written off for demo'
      )
  loop
    perform public.adjust_inventory(
      r.product_id, -r.quantity, 'damage', 'Written off for demo', null, 'seed', null
    );
  end loop;
end;
$demo$;
