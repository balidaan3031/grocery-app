-- =============================================================================
-- 0001 · Extensions and enumerated types
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- trigram indexes for fuzzy product search
create extension if not exists "citext";        -- case-insensitive email

-- Roles a store user can hold. `admin` may mutate catalogue/inventory settings and
-- see financial summaries; `staff` runs the till (scan, cart, checkout).
do $$ begin
  create type user_role as enum ('admin', 'staff');
exception when duplicate_object then null; end $$;

-- Every stock delta is classified so the movement ledger stays auditable.
do $$ begin
  create type movement_type as enum (
    'purchase',    -- restock from a supplier
    'sale',        -- deducted by a completed order
    'adjustment',  -- manual correction by a user
    'return',      -- customer returned goods, stock comes back
    'damage'       -- write-off: expired / broken / shrinkage
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type cart_status as enum ('active', 'converted', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'completed', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'card', 'upi', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep `updated_at` honest without trusting the client.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
