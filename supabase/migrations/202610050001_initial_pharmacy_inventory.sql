-- OneCallPharmacy initial relational schema
-- Apply in Supabase SQL Editor or with `supabase db push`.
-- This migration is designed for a NEW schema. Review existing tables before applying to a live project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('customer', 'pharmacy_owner', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fulfillment_type as enum ('delivery', 'pickup');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text,
  email text,
  address text not null,
  state text not null,
  district text not null,
  city text not null,
  pincode text,
  latitude double precision,
  longitude double precision,
  opening_time time,
  closing_time time,
  is_24_hours boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  generic_name text,
  brand_name text,
  category text,
  strength text,
  dosage_form text,
  pack_size text,
  manufacturer text,
  prescription_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, strength, dosage_form, pack_size)
);

-- One row per medicine stocked by one pharmacy; batch details are stored separately.
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id) on delete restrict,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  reorder_level integer not null default 10 check (reorder_level >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  average_purchase_cost numeric(12,2) not null default 0 check (average_purchase_cost >= 0),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, medicine_id)
);

create table if not exists public.medicine_batches (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id) on delete restrict,
  batch_number text not null,
  expiry_date date,
  quantity_received integer not null default 0 check (quantity_received >= 0),
  quantity_remaining integer not null default 0 check (quantity_remaining >= 0),
  purchase_cost_per_unit numeric(12,2) not null check (purchase_cost_per_unit >= 0),
  selling_price_per_unit numeric(12,2) not null check (selling_price_per_unit >= 0),
  supplier_name text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (pharmacy_id, medicine_id, batch_number)
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  supplier_name text,
  invoice_number text,
  purchased_at timestamptz not null default now(),
  total_cost numeric(14,2) not null default 0 check (total_cost >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id) on delete restrict,
  batch_number text,
  expiry_date date,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_cost) stored
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text,
  fulfillment public.fulfillment_type not null default 'delivery',
  status public.order_status not null default 'pending',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint delivery_requires_address check (fulfillment <> 'delivery' or nullif(trim(delivery_address), '') is not null)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_selling_price numeric(12,2) not null check (unit_selling_price >= 0),
  unit_cost_snapshot numeric(12,2) not null check (unit_cost_snapshot >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_selling_price) stored
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id) on delete restrict,
  batch_id uuid references public.medicine_batches(id) on delete set null,
  movement_type text not null check (movement_type in ('purchase', 'sale', 'return', 'adjustment', 'expired', 'order_cancelled')),
  quantity_change integer not null,
  unit_cost numeric(12,2),
  unit_selling_price numeric(12,2),
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pharmacies_location on public.pharmacies(state, district, city);
create index if not exists idx_inventory_pharmacy on public.inventory(pharmacy_id);
create index if not exists idx_inventory_medicine on public.inventory(medicine_id);
create index if not exists idx_batches_expiry on public.medicine_batches(pharmacy_id, expiry_date);
create index if not exists idx_orders_pharmacy_created on public.orders(pharmacy_id, created_at desc);
create index if not exists idx_order_items_medicine on public.order_items(medicine_id);
create index if not exists idx_stock_movements_pharmacy_date on public.stock_movements(pharmacy_id, created_at desc);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $$;

create or replace function public.owns_pharmacy(target_pharmacy uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.pharmacies p where p.id = target_pharmacy and p.owner_user_id = auth.uid()) $$;

-- Create a basic customer profile whenever an Auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Atomic online ordering: validates stock, locks inventory rows, creates the order,
-- snapshots prices/costs, and reduces stock in one transaction.
create or replace function public.place_pharmacy_order(
  p_pharmacy_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_fulfillment public.fulfillment_type,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_medicine_id uuid;
  v_qty integer;
  v_price numeric(12,2);
  v_cost numeric(12,2);
  v_available integer;
  v_subtotal numeric(14,2) := 0;
begin
  if nullif(trim(p_customer_name), '') is null then raise exception 'Customer name is required'; end if;
  if nullif(trim(p_customer_phone), '') is null then raise exception 'Customer phone is required'; end if;
  if p_fulfillment = 'delivery' and nullif(trim(p_delivery_address), '') is null then
    raise exception 'Delivery address is required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one medicine';
  end if;
  if not exists (select 1 from public.pharmacies p where p.id = p_pharmacy_id and p.is_active) then
    raise exception 'Pharmacy is unavailable';
  end if;

  -- Check and lock all requested stock rows in stable medicine-id order.
  for v_item in
    select value from jsonb_array_elements(p_items) order by (value->>'medicine_id')
  loop
    v_medicine_id := (v_item->>'medicine_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;

    select i.quantity_on_hand, i.selling_price, i.average_purchase_cost
      into v_available, v_price, v_cost
    from public.inventory i
    where i.pharmacy_id = p_pharmacy_id and i.medicine_id = v_medicine_id
    for update;

    if not found then raise exception 'One of the selected medicines is not stocked by this pharmacy'; end if;
    if v_available < v_qty then raise exception 'Insufficient stock for medicine %', v_medicine_id; end if;
    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;

  insert into public.orders (
    pharmacy_id, customer_user_id, customer_name, customer_phone, delivery_address, fulfillment, status, subtotal
  ) values (
    p_pharmacy_id, auth.uid(), trim(p_customer_name), trim(p_customer_phone),
    nullif(trim(p_delivery_address), ''), p_fulfillment, 'confirmed', v_subtotal
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_medicine_id := (v_item->>'medicine_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    select i.selling_price, i.average_purchase_cost into v_price, v_cost
    from public.inventory i
    where i.pharmacy_id = p_pharmacy_id and i.medicine_id = v_medicine_id
    for update;

    insert into public.order_items (order_id, medicine_id, quantity, unit_selling_price, unit_cost_snapshot)
    values (v_order_id, v_medicine_id, v_qty, v_price, v_cost);

    update public.inventory
    set quantity_on_hand = quantity_on_hand - v_qty, updated_at = now()
    where pharmacy_id = p_pharmacy_id and medicine_id = v_medicine_id;

    insert into public.stock_movements (
      pharmacy_id, medicine_id, movement_type, quantity_change,
      unit_cost, unit_selling_price, reference_type, reference_id, created_by
    ) values (
      p_pharmacy_id, v_medicine_id, 'sale', -v_qty, v_cost, v_price, 'order', v_order_id, auth.uid()
    );
  end loop;

  return v_order_id;
end;
$$;

-- Low stock and expiry views
create or replace view public.pharmacy_inventory_status with (security_invoker = true) as
select
  i.pharmacy_id, p.name as pharmacy_name, p.state, p.district, p.city,
  i.medicine_id, m.name as medicine_name, m.generic_name,
  i.quantity_on_hand, i.reorder_level, i.selling_price, i.average_purchase_cost,
  (i.quantity_on_hand <= i.reorder_level) as is_low_stock,
  coalesce(b.nearest_expiry, null) as nearest_expiry
from public.inventory i
join public.pharmacies p on p.id = i.pharmacy_id
join public.medicines m on m.id = i.medicine_id
left join lateral (
  select min(mb.expiry_date) as nearest_expiry
  from public.medicine_batches mb
  where mb.pharmacy_id = i.pharmacy_id and mb.medicine_id = i.medicine_id
    and mb.quantity_remaining > 0 and mb.expiry_date is not null
) b on true;

-- Admin analytics: completed orders only count toward realized sales/profit.
create or replace view public.admin_medicine_performance with (security_invoker = true) as
select
  m.id as medicine_id, m.name as medicine_name,
  count(distinct o.pharmacy_id) as pharmacies_selling,
  coalesce(sum(oi.quantity) filter (where o.status = 'completed'), 0)::bigint as units_sold,
  coalesce(sum(oi.line_total) filter (where o.status = 'completed'), 0) as sales_revenue,
  coalesce(sum(oi.quantity * oi.unit_cost_snapshot) filter (where o.status = 'completed'), 0) as cost_of_goods_sold,
  coalesce(sum(oi.line_total - oi.quantity * oi.unit_cost_snapshot) filter (where o.status = 'completed'), 0) as gross_profit
from public.medicines m
left join public.order_items oi on oi.medicine_id = m.id
left join public.orders o on o.id = oi.order_id
where public.is_admin()
group by m.id, m.name;

create or replace view public.admin_location_performance with (security_invoker = true) as
select
  p.state, p.district, p.city,
  count(distinct p.id) as pharmacy_count,
  coalesce(sum(oi.quantity) filter (where o.status = 'completed'), 0)::bigint as units_sold,
  coalesce(sum(oi.line_total) filter (where o.status = 'completed'), 0) as sales_revenue,
  coalesce(sum(oi.line_total - oi.quantity * oi.unit_cost_snapshot) filter (where o.status = 'completed'), 0) as gross_profit
from public.pharmacies p
left join public.orders o on o.pharmacy_id = p.id
left join public.order_items oi on oi.order_id = o.id
where public.is_admin()
group by p.state, p.district, p.city;

-- RLS
alter table public.profiles enable row level security;
alter table public.pharmacies enable row level security;
alter table public.medicines enable row level security;
alter table public.inventory enable row level security;
alter table public.medicine_batches enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles for select
using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_insert_self_as_customer" on public.profiles;
create policy "profiles_insert_self_as_customer" on public.profiles for insert
with check (id = auth.uid() and role = 'customer');

drop policy if exists "active_pharmacies_public_read" on public.pharmacies;
create policy "active_pharmacies_public_read" on public.pharmacies for select
using (is_active or owner_user_id = auth.uid() or public.is_admin());
drop policy if exists "pharmacy_owner_update_own" on public.pharmacies;
create policy "pharmacy_owner_update_own" on public.pharmacies for update
using (owner_user_id = auth.uid() or public.is_admin())
with check (owner_user_id = auth.uid() or public.is_admin());

drop policy if exists "medicines_read_authenticated_or_public" on public.medicines;
create policy "medicines_read_authenticated_or_public" on public.medicines for select using (true);
drop policy if exists "medicine_admin_manage" on public.medicines;
create policy "medicine_admin_manage" on public.medicines for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "inventory_public_read" on public.inventory;
create policy "inventory_public_read" on public.inventory for select using (
  exists (select 1 from public.pharmacies p where p.id = pharmacy_id and p.is_active)
);
drop policy if exists "inventory_owner_manage" on public.inventory;
create policy "inventory_owner_manage" on public.inventory for all
using (public.owns_pharmacy(pharmacy_id) or public.is_admin())
with check (public.owns_pharmacy(pharmacy_id) or public.is_admin());

drop policy if exists "batches_owner_manage" on public.medicine_batches;
create policy "batches_owner_manage" on public.medicine_batches for all
using (public.owns_pharmacy(pharmacy_id) or public.is_admin())
with check (public.owns_pharmacy(pharmacy_id) or public.is_admin());

drop policy if exists "purchases_owner_manage" on public.purchases;
create policy "purchases_owner_manage" on public.purchases for all
using (public.owns_pharmacy(pharmacy_id) or public.is_admin())
with check (public.owns_pharmacy(pharmacy_id) or public.is_admin());

drop policy if exists "purchase_items_owner_manage" on public.purchase_items;
create policy "purchase_items_owner_manage" on public.purchase_items for all
using (exists (select 1 from public.purchases pu where pu.id = purchase_id and (public.owns_pharmacy(pu.pharmacy_id) or public.is_admin())))
with check (exists (select 1 from public.purchases pu where pu.id = purchase_id and (public.owns_pharmacy(pu.pharmacy_id) or public.is_admin())));

drop policy if exists "orders_customer_or_pharmacy_read" on public.orders;
create policy "orders_customer_or_pharmacy_read" on public.orders for select
using (customer_user_id = auth.uid() or public.owns_pharmacy(pharmacy_id) or public.is_admin());
drop policy if exists "orders_customer_or_pharmacy_update" on public.orders;
create policy "orders_customer_or_pharmacy_update" on public.orders for update
using (public.owns_pharmacy(pharmacy_id) or public.is_admin())
with check (public.owns_pharmacy(pharmacy_id) or public.is_admin());

drop policy if exists "order_items_customer_or_pharmacy_read" on public.order_items;
create policy "order_items_customer_or_pharmacy_read" on public.order_items for select
using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_user_id = auth.uid() or public.owns_pharmacy(o.pharmacy_id) or public.is_admin())));

drop policy if exists "stock_movements_owner_read" on public.stock_movements;
create policy "stock_movements_owner_read" on public.stock_movements for select
using (public.owns_pharmacy(pharmacy_id) or public.is_admin());

grant select on public.pharmacies, public.medicines to anon, authenticated;
grant select on public.pharmacy_inventory_status to anon, authenticated;
grant select on public.admin_medicine_performance, public.admin_location_performance to authenticated;
grant execute on function public.place_pharmacy_order(uuid, text, text, text, public.fulfillment_type, jsonb) to anon, authenticated;
