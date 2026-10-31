-- Pharmacy-owned supplier contacts with opt-in shared contacts.
-- Supplier catalogues and prices are specific to each pharmacy relationship.
-- A confirmed goods receipt reuses record_pharmacy_purchase so stock, batch,
-- purchase, and movement records remain in the existing transaction path.
-- IF NOT EXISTS and policy replacement make this script safe to rerun after a
-- partial/manual SQL Editor attempt without dropping existing supplier data.

create table if not exists public.distributors (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  company_name text not null check (length(btrim(company_name)) between 2 and 160),
  contact_person text not null check (length(btrim(contact_person)) between 2 and 120),
  phone text not null check (length(btrim(phone)) between 5 and 40),
  email text,
  address text not null check (length(btrim(address)) between 3 and 500),
  city text not null check (length(btrim(city)) between 2 and 120),
  service_area text,
  medicine_categories text[] not null default '{}',
  delivery_information text,
  sharing_scope text not null default 'private' check (sharing_scope in ('private', 'shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Older distributor tables may already exist without the pharmacy sharing field.
-- Existing contacts stay private until their owner explicitly shares them.
alter table public.distributors
  add column if not exists sharing_scope text not null default 'private'
  check (sharing_scope in ('private', 'shared'));
alter table public.distributors
  add column if not exists created_by uuid references auth.users(id) on delete restrict;

create table if not exists public.pharmacy_distributors (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  is_active boolean not null default true,
  is_preferred boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (pharmacy_id, distributor_id),
  unique (id, pharmacy_id),
  unique (id, pharmacy_id, distributor_id)
);

create table if not exists public.pharmacy_distributor_medicines (
  id uuid primary key default gen_random_uuid(),
  pharmacy_distributor_id uuid not null,
  pharmacy_id uuid not null,
  medicine_id uuid not null references public.medicines(id) on delete restrict,
  unit_price numeric(12,2) check (unit_price is null or unit_price >= 0),
  minimum_order_quantity integer check (minimum_order_quantity is null or minimum_order_quantity > 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_distributor_id, medicine_id),
  unique (id, pharmacy_distributor_id, medicine_id),
  foreign key (pharmacy_distributor_id, pharmacy_id)
    references public.pharmacy_distributors(id, pharmacy_id) on delete cascade
);

create table if not exists public.distributor_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  pharmacy_distributor_id uuid not null,
  distributor_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'processing', 'dispatched', 'partially_received', 'received', 'cancelled')),
  order_date timestamptz not null default now(),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  delivery_instructions text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, pharmacy_id),
  constraint distributor_purchase_orders_pharmacy_link_fkey
    foreign key (pharmacy_distributor_id, pharmacy_id, distributor_id)
    references public.pharmacy_distributors(id, pharmacy_id, distributor_id) on delete restrict
);

-- Upgrade an earlier order table in place. Preserve old orders and associate
-- each with the pharmacy-specific supplier link that fulfilled it.
alter table public.distributor_purchase_orders
  add column if not exists pharmacy_distributor_id uuid;

insert into public.pharmacy_distributors (pharmacy_id, distributor_id, created_by)
select distinct po.pharmacy_id, po.distributor_id, p.owner_user_id
from public.distributor_purchase_orders po
join public.pharmacies p on p.id = po.pharmacy_id
join public.distributors d on d.id = po.distributor_id
where p.owner_user_id is not null
on conflict (pharmacy_id, distributor_id) do nothing;

update public.distributor_purchase_orders po
set pharmacy_distributor_id = pd.id
from public.pharmacy_distributors pd
where po.pharmacy_distributor_id is null
  and pd.pharmacy_id = po.pharmacy_id
  and pd.distributor_id = po.distributor_id;

-- Attribute legacy private contacts to the owner of their earliest linked pharmacy.
update public.distributors d
set created_by = (
  select p.owner_user_id
  from public.pharmacy_distributors pd
  join public.pharmacies p on p.id = pd.pharmacy_id
  where pd.distributor_id = d.id and p.owner_user_id is not null
  order by pd.created_at
  limit 1
)
where d.created_by is null
  and exists (
    select 1 from public.pharmacy_distributors pd
    join public.pharmacies p on p.id = pd.pharmacy_id
    where pd.distributor_id = d.id and p.owner_user_id is not null
  );

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.distributor_purchase_orders'::regclass
      and conname = 'distributor_purchase_orders_pharmacy_link_fkey'
  ) then
    alter table public.distributor_purchase_orders
      add constraint distributor_purchase_orders_pharmacy_link_fkey
      foreign key (pharmacy_distributor_id, pharmacy_id, distributor_id)
      references public.pharmacy_distributors(id, pharmacy_id, distributor_id)
      on delete restrict not valid;
  end if;
end;
$$;

create table if not exists public.distributor_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.distributor_purchase_orders(id) on delete restrict,
  pharmacy_distributor_id uuid not null,
  medicine_id uuid not null references public.medicines(id) on delete restrict,
  pharmacy_distributor_medicine_id uuid not null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, pharmacy_distributor_medicine_id),
  foreign key (pharmacy_distributor_medicine_id, pharmacy_distributor_id, medicine_id)
    references public.pharmacy_distributor_medicines(id, pharmacy_distributor_id, medicine_id) on delete restrict
);

-- Backfill the pharmacy-specific item columns when upgrading older orders.
alter table public.distributor_purchase_order_items
  add column if not exists pharmacy_distributor_id uuid,
  add column if not exists pharmacy_distributor_medicine_id uuid,
  add column if not exists quantity_received integer not null default 0;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'distributor_purchase_order_items'
      and column_name = 'distributor_medicine_id' and is_nullable = 'NO'
  ) then
    alter table public.distributor_purchase_order_items
      alter column distributor_medicine_id drop not null;
  end if;
end;
$$;

update public.distributor_purchase_order_items oi
set pharmacy_distributor_id = po.pharmacy_distributor_id
from public.distributor_purchase_orders po
where oi.order_id = po.id and oi.pharmacy_distributor_id is null
  and po.pharmacy_distributor_id is not null;

insert into public.pharmacy_distributor_medicines (
  pharmacy_distributor_id, pharmacy_id, medicine_id, unit_price, is_available
)
select distinct po.pharmacy_distributor_id, po.pharmacy_id, oi.medicine_id, oi.unit_price, true
from public.distributor_purchase_order_items oi
join public.distributor_purchase_orders po on po.id = oi.order_id
where po.pharmacy_distributor_id is not null and oi.medicine_id is not null
  and oi.unit_price is not null and oi.unit_price >= 0
on conflict (pharmacy_distributor_id, medicine_id) do nothing;

update public.distributor_purchase_order_items oi
set pharmacy_distributor_medicine_id = dm.id
from public.distributor_purchase_orders po, public.pharmacy_distributor_medicines dm
where oi.order_id = po.id and oi.pharmacy_distributor_id = dm.pharmacy_distributor_id
  and po.pharmacy_id = dm.pharmacy_id and oi.medicine_id = dm.medicine_id
  and oi.pharmacy_distributor_medicine_id is null;

create table if not exists public.distributor_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  pharmacy_id uuid not null,
  idempotency_key uuid not null,
  request_hash text not null,
  received_by uuid not null references auth.users(id) on delete restrict,
  notes text,
  received_at timestamptz not null default now(),
  unique (pharmacy_id, idempotency_key),
  unique (id, order_id),
  foreign key (order_id, pharmacy_id)
    references public.distributor_purchase_orders(id, pharmacy_id) on delete restrict
);

create table if not exists public.distributor_goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  order_id uuid not null,
  order_item_id uuid not null references public.distributor_purchase_order_items(id) on delete restrict,
  quantity_received integer not null check (quantity_received > 0),
  batch_number text not null check (length(btrim(batch_number)) between 1 and 100),
  expiry_date date not null,
  manufacturing_date date,
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  purchase_id uuid references public.purchases(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (receipt_id, order_id) references public.distributor_goods_receipts(id, order_id) on delete restrict
);

create index if not exists distributors_shared_idx on public.distributors (sharing_scope, city);
create index if not exists pharmacy_distributors_owner_idx on public.pharmacy_distributors (pharmacy_id, is_active, is_preferred);
create index if not exists pharmacy_distributor_medicines_lookup_idx on public.pharmacy_distributor_medicines (pharmacy_id, medicine_id, is_available);
create index if not exists distributor_po_pharmacy_idx on public.distributor_purchase_orders (pharmacy_id, order_date desc);
create index if not exists distributor_receipt_order_idx on public.distributor_goods_receipts (order_id, received_at desc);

alter table public.distributors enable row level security;
alter table public.pharmacy_distributors enable row level security;
alter table public.pharmacy_distributor_medicines enable row level security;
alter table public.distributor_purchase_orders enable row level security;
alter table public.distributor_purchase_order_items enable row level security;
alter table public.distributor_goods_receipts enable row level security;
alter table public.distributor_goods_receipt_items enable row level security;

drop policy if exists "pharmacy owners see linked or shared distributor contacts" on public.distributors;
create policy "pharmacy owners see linked or shared distributor contacts" on public.distributors
  for select to authenticated using (
    public.is_admin()
    or (sharing_scope = 'shared' and exists (
      select 1 from public.pharmacies p where p.owner_user_id = auth.uid() and p.is_active and p.verification_status = 'approved'
    ))
    or exists (
      select 1 from public.pharmacy_distributors pd join public.pharmacies p on p.id = pd.pharmacy_id
      where pd.distributor_id = distributors.id and public.owns_pharmacy(pd.pharmacy_id)
        and (distributors.sharing_scope = 'shared' or p.owner_user_id = auth.uid())
    )
  );
drop policy if exists "pharmacy owners see their distributor links" on public.pharmacy_distributors;
create policy "pharmacy owners see their distributor links" on public.pharmacy_distributors
  for select to authenticated using (public.owns_pharmacy(pharmacy_id) or public.is_admin());
drop policy if exists "pharmacy owners see their distributor catalogue" on public.pharmacy_distributor_medicines;
create policy "pharmacy owners see their distributor catalogue" on public.pharmacy_distributor_medicines
  for select to authenticated using (public.owns_pharmacy(pharmacy_id) or public.is_admin());
drop policy if exists "pharmacy owners see their purchase orders" on public.distributor_purchase_orders;
create policy "pharmacy owners see their purchase orders" on public.distributor_purchase_orders
  for select to authenticated using (public.owns_pharmacy(pharmacy_id) or public.is_admin());
drop policy if exists "pharmacy owners see their purchase order lines" on public.distributor_purchase_order_items;
create policy "pharmacy owners see their purchase order lines" on public.distributor_purchase_order_items
  for select to authenticated using (
    exists (select 1 from public.distributor_purchase_orders po where po.id = order_id
      and (public.owns_pharmacy(po.pharmacy_id) or public.is_admin()))
  );
drop policy if exists "pharmacy owners see their goods receipts" on public.distributor_goods_receipts;
create policy "pharmacy owners see their goods receipts" on public.distributor_goods_receipts
  for select to authenticated using (public.owns_pharmacy(pharmacy_id) or public.is_admin());
drop policy if exists "pharmacy owners see their goods receipt lines" on public.distributor_goods_receipt_items;
create policy "pharmacy owners see their goods receipt lines" on public.distributor_goods_receipt_items
  for select to authenticated using (
    exists (select 1 from public.distributor_goods_receipts gr where gr.id = receipt_id
      and (public.owns_pharmacy(gr.pharmacy_id) or public.is_admin()))
  );

revoke all on public.distributors, public.pharmacy_distributors, public.pharmacy_distributor_medicines,
  public.distributor_purchase_orders, public.distributor_purchase_order_items,
  public.distributor_goods_receipts, public.distributor_goods_receipt_items
  from public, anon, authenticated;
grant select on public.distributors, public.pharmacy_distributors, public.pharmacy_distributor_medicines,
  public.distributor_purchase_orders, public.distributor_purchase_order_items,
  public.distributor_goods_receipts, public.distributor_goods_receipt_items to authenticated;

-- Remove the older RPC overload that selected the owner's first pharmacy.
drop function if exists public.add_pharmacy_distributor(text, text, text, text, text, text, text, text[], text, text);
create or replace function public.add_pharmacy_distributor(
  p_pharmacy_id uuid,
  p_company_name text,
  p_contact_person text,
  p_phone text,
  p_email text,
  p_address text,
  p_city text,
  p_service_area text default null,
  p_medicine_categories text[] default '{}',
  p_delivery_information text default null,
  p_sharing_scope text default 'private'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pharmacy_id uuid;
  v_distributor_id uuid;
  v_link_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to add a supplier'; end if;
  select p.id into v_pharmacy_id from public.pharmacies p
  where p.id = p_pharmacy_id and p.owner_user_id = auth.uid()
    and p.is_active and p.verification_status = 'approved';
  if v_pharmacy_id is null then raise exception 'An active, approved pharmacy is required to manage suppliers'; end if;
  perform public.assert_pharmacy_inventory_access(v_pharmacy_id);
  if p_sharing_scope not in ('private', 'shared') then raise exception 'Choose private or shared contact visibility'; end if;
  if nullif(pg_catalog.btrim(p_company_name), '') is null or nullif(pg_catalog.btrim(p_contact_person), '') is null
    or nullif(pg_catalog.btrim(p_phone), '') is null or nullif(pg_catalog.btrim(p_address), '') is null
    or nullif(pg_catalog.btrim(p_city), '') is null then
    raise exception 'Company, contact, phone, address, and city are required';
  end if;
  insert into public.distributors (
    created_by, company_name, contact_person, phone, email, address, city, service_area,
    medicine_categories, delivery_information, sharing_scope
  ) values (
    auth.uid(), pg_catalog.btrim(p_company_name), pg_catalog.btrim(p_contact_person), pg_catalog.btrim(p_phone),
    nullif(pg_catalog.btrim(p_email), ''), pg_catalog.btrim(p_address), pg_catalog.btrim(p_city),
    nullif(pg_catalog.btrim(p_service_area), ''),
    coalesce((select pg_catalog.array_agg(distinct pg_catalog.btrim(c)) from pg_catalog.unnest(coalesce(p_medicine_categories, '{}')) c where pg_catalog.btrim(c) <> ''), '{}'),
    nullif(pg_catalog.btrim(p_delivery_information), ''), p_sharing_scope
  ) returning id into v_distributor_id;
  insert into public.pharmacy_distributors (pharmacy_id, distributor_id, created_by)
  values (v_pharmacy_id, v_distributor_id, auth.uid()) returning id into v_link_id;
  return v_link_id;
end;
$$;

create or replace function public.update_pharmacy_distributor(
  p_pharmacy_distributor_id uuid,
  p_company_name text,
  p_contact_person text,
  p_phone text,
  p_email text,
  p_address text,
  p_city text,
  p_service_area text default null,
  p_medicine_categories text[] default '{}',
  p_delivery_information text default null,
  p_sharing_scope text default 'private'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_distributor_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before editing a supplier'; end if;
  if p_sharing_scope not in ('private', 'shared') then raise exception 'Choose private or shared contact visibility'; end if;
  select d.id into v_distributor_id from public.distributors d
  join public.pharmacy_distributors pd on pd.distributor_id = d.id
  join public.pharmacies p on p.id = pd.pharmacy_id
  where pd.id = p_pharmacy_distributor_id and p.owner_user_id = auth.uid()
    and p.is_active and p.verification_status = 'approved'
    and (d.created_by = auth.uid() or (d.created_by is null and d.sharing_scope = 'private'));
  if v_distributor_id is null then raise exception 'Only the supplier contact creator can edit its shared details'; end if;
  if nullif(pg_catalog.btrim(p_company_name), '') is null or nullif(pg_catalog.btrim(p_contact_person), '') is null
    or nullif(pg_catalog.btrim(p_phone), '') is null or nullif(pg_catalog.btrim(p_address), '') is null
    or nullif(pg_catalog.btrim(p_city), '') is null then raise exception 'Company, contact, phone, address, and city are required'; end if;
  update public.distributors set
    created_by = coalesce(created_by, auth.uid()),
    company_name = pg_catalog.btrim(p_company_name), contact_person = pg_catalog.btrim(p_contact_person),
    phone = pg_catalog.btrim(p_phone), email = nullif(pg_catalog.btrim(p_email), ''), address = pg_catalog.btrim(p_address),
    city = pg_catalog.btrim(p_city), service_area = nullif(pg_catalog.btrim(p_service_area), ''),
    medicine_categories = coalesce((select pg_catalog.array_agg(distinct pg_catalog.btrim(c)) from pg_catalog.unnest(coalesce(p_medicine_categories, '{}')) c where pg_catalog.btrim(c) <> ''), '{}'),
    delivery_information = nullif(pg_catalog.btrim(p_delivery_information), ''), sharing_scope = p_sharing_scope, updated_at = pg_catalog.now()
  where id = v_distributor_id;
end;
$$;

drop function if exists public.link_shared_distributor(uuid);
create or replace function public.link_shared_distributor(p_pharmacy_id uuid, p_distributor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_pharmacy_id uuid; v_link_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to link a supplier'; end if;
  select p.id into v_pharmacy_id from public.pharmacies p
  where p.id = p_pharmacy_id and p.owner_user_id = auth.uid()
    and p.is_active and p.verification_status = 'approved';
  if v_pharmacy_id is null then raise exception 'An active, approved pharmacy is required to manage suppliers'; end if;
  perform public.assert_pharmacy_inventory_access(v_pharmacy_id);
  if not exists (select 1 from public.distributors d where d.id = p_distributor_id and d.sharing_scope = 'shared') then
    raise exception 'This supplier is not available as a shared contact';
  end if;
  insert into public.pharmacy_distributors (pharmacy_id, distributor_id, created_by)
  values (v_pharmacy_id, p_distributor_id, auth.uid()) on conflict (pharmacy_id, distributor_id) do nothing;
  select id into v_link_id from public.pharmacy_distributors where pharmacy_id = v_pharmacy_id and distributor_id = p_distributor_id;
  return v_link_id;
end;
$$;

create or replace function public.set_pharmacy_distributor_status(
  p_pharmacy_distributor_id uuid,
  p_is_active boolean,
  p_is_preferred boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_pharmacy_id uuid;
begin
  select pd.pharmacy_id into v_pharmacy_id from public.pharmacy_distributors pd
  join public.pharmacies p on p.id = pd.pharmacy_id
  where pd.id = p_pharmacy_distributor_id and p.owner_user_id = auth.uid()
    and p.is_active and p.verification_status = 'approved';
  if v_pharmacy_id is null then raise exception 'Not authorized to manage this pharmacy supplier'; end if;
  perform public.assert_pharmacy_inventory_access(v_pharmacy_id);
  if p_is_preferred then
    update public.pharmacy_distributors set is_preferred = false where pharmacy_id = v_pharmacy_id;
  end if;
  update public.pharmacy_distributors set is_active = coalesce(p_is_active, true), is_preferred = coalesce(p_is_preferred, false)
  where id = p_pharmacy_distributor_id;
end;
$$;

create or replace function public.save_pharmacy_distributor_medicine(
  p_pharmacy_distributor_id uuid,
  p_medicine_id uuid,
  p_unit_price numeric default null,
  p_minimum_order_quantity integer default null,
  p_is_available boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_pharmacy_id uuid; v_id uuid;
begin
  select pd.pharmacy_id into v_pharmacy_id from public.pharmacy_distributors pd
  join public.pharmacies p on p.id = pd.pharmacy_id
  where pd.id = p_pharmacy_distributor_id and p.owner_user_id = auth.uid()
    and p.is_active and p.verification_status = 'approved' and pd.is_active;
  if v_pharmacy_id is null then raise exception 'Not authorized to manage this pharmacy supplier'; end if;
  perform public.assert_pharmacy_inventory_access(v_pharmacy_id);
  if p_unit_price is not null and p_unit_price < 0 then raise exception 'Unit price cannot be negative'; end if;
  if p_minimum_order_quantity is not null and p_minimum_order_quantity <= 0 then raise exception 'Minimum order quantity must be positive'; end if;
  if not exists (select 1 from public.medicines m where m.id = p_medicine_id) then raise exception 'Select a valid medicine'; end if;
  insert into public.pharmacy_distributor_medicines (pharmacy_distributor_id, pharmacy_id, medicine_id, unit_price, minimum_order_quantity, is_available)
  values (p_pharmacy_distributor_id, v_pharmacy_id, p_medicine_id, p_unit_price, p_minimum_order_quantity, coalesce(p_is_available, true))
  on conflict (pharmacy_distributor_id, medicine_id) do update
  set unit_price = excluded.unit_price, minimum_order_quantity = excluded.minimum_order_quantity,
      is_available = excluded.is_available, updated_at = pg_catalog.now()
  returning id into v_id;
  return v_id;
end;
$$;

-- The earlier supplier workflow used p_distributor_id for this same SQL
-- signature. PostgreSQL cannot rename RPC arguments with CREATE OR REPLACE.
drop function if exists public.create_distributor_purchase_order(uuid, jsonb, text);
create or replace function public.create_distributor_purchase_order(
  p_pharmacy_distributor_id uuid,
  p_items jsonb,
  p_delivery_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pharmacy_id uuid;
  v_distributor_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_total numeric(14,2) := 0;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in before placing an order'; end if;
  select p.id into v_pharmacy_id
  from public.pharmacy_distributors pd
  join public.pharmacies p on p.id = pd.pharmacy_id
  where pd.id = p_pharmacy_distributor_id and pd.is_active
    and p.owner_user_id = auth.uid() and p.is_active and p.verification_status = 'approved';
  if v_pharmacy_id is null then raise exception 'An active, approved pharmacy is required to place an order'; end if;
  perform public.assert_pharmacy_inventory_access(v_pharmacy_id);
  select pd.distributor_id into v_distributor_id
  from public.pharmacy_distributors pd join public.distributors d on d.id = pd.distributor_id
  where pd.id = p_pharmacy_distributor_id and pd.pharmacy_id = v_pharmacy_id and pd.is_active
  for share of pd, d;
  if v_distributor_id is null then raise exception 'Select an active supplier linked to this pharmacy'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one medicine to the order'; end if;
  if length(coalesce(p_delivery_instructions, '')) > 1000 then raise exception 'Delivery instructions are too long'; end if;
  insert into public.distributor_purchase_orders (pharmacy_id, pharmacy_distributor_id, distributor_id, status, delivery_instructions, created_by)
  values (v_pharmacy_id, p_pharmacy_distributor_id, v_distributor_id, 'pending', nullif(pg_catalog.btrim(p_delivery_instructions), ''), auth.uid())
  returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'pharmacy_distributor_medicine_id', '') !~* '^[0-9a-f-]{36}$'
      or coalesce(v_item->>'quantity', '') !~ '^[0-9]{1,7}$' then raise exception 'Each line needs a valid supplied medicine and whole-number quantity'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity <= 0 then raise exception 'Order quantities must be greater than zero'; end if;
    select dm.id, dm.medicine_id, dm.unit_price, dm.minimum_order_quantity
      into v_product from public.pharmacy_distributor_medicines dm
      where dm.id = (v_item->>'pharmacy_distributor_medicine_id')::uuid
        and dm.pharmacy_distributor_id = p_pharmacy_distributor_id and dm.pharmacy_id = v_pharmacy_id and dm.is_available
      for share;
    if not found or v_product.unit_price is null then raise exception 'A selected medicine is unavailable or has no configured price'; end if;
    if v_product.minimum_order_quantity is not null and v_quantity < v_product.minimum_order_quantity then raise exception 'Quantity is below the supplier minimum'; end if;
    insert into public.distributor_purchase_order_items (
      order_id, pharmacy_distributor_id, medicine_id, pharmacy_distributor_medicine_id, quantity_ordered, unit_price, line_total
    ) values (v_order_id, p_pharmacy_distributor_id, v_product.medicine_id, v_product.id, v_quantity, v_product.unit_price, v_quantity * v_product.unit_price);
    v_total := v_total + v_quantity * v_product.unit_price;
    v_count := v_count + 1;
  end loop;
  if v_count <> jsonb_array_length(p_items) then raise exception 'Duplicate medicine lines are not allowed'; end if;
  update public.distributor_purchase_orders set total_amount = v_total, updated_at = pg_catalog.now() where id = v_order_id;
  return v_order_id;
end;
$$;

create or replace function public.update_distributor_purchase_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.distributor_purchase_orders%rowtype;
begin
  select * into v_order from public.distributor_purchase_orders where id = p_order_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  perform public.assert_pharmacy_inventory_access(v_order.pharmacy_id);
  if not public.owns_pharmacy(v_order.pharmacy_id) then raise exception 'Not authorized to update this purchase order'; end if;
  if p_status = 'accepted' and v_order.status = 'pending' then null;
  elsif p_status = 'processing' and v_order.status = 'accepted' then null;
  elsif p_status = 'dispatched' and v_order.status = 'processing' then null;
  elsif p_status = 'cancelled' and v_order.status in ('pending', 'accepted', 'processing') then
    if exists (select 1 from public.distributor_goods_receipts gr where gr.order_id = p_order_id) then raise exception 'An order with a goods receipt cannot be cancelled'; end if;
  else raise exception 'This purchase order status change is not allowed';
  end if;
  update public.distributor_purchase_orders set status = p_status, updated_at = pg_catalog.now() where id = p_order_id;
end;
$$;

create or replace function public.record_distributor_goods_receipt(
  p_order_id uuid,
  p_idempotency_key uuid,
  p_lines jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.distributor_purchase_orders%rowtype;
  v_existing public.distributor_goods_receipts%rowtype;
  v_receipt_id uuid;
  v_hash text;
  v_line jsonb;
  v_order_item public.distributor_purchase_order_items%rowtype;
  v_quantity integer;
  v_expiry date;
  v_manufactured date;
  v_selling numeric(12,2);
  v_current_selling numeric(12,2);
  v_purchase_id uuid;
  v_remaining integer;
begin
  if auth.uid() is null then raise exception 'Sign in before recording a delivery'; end if;
  if p_idempotency_key is null then raise exception 'Receipt key is required'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one received item'; end if;
  if length(coalesce(p_notes, '')) > 1000 then raise exception 'Receipt notes are too long'; end if;
  v_hash := md5(p_lines::text || coalesce(p_notes, ''));
  select * into v_order from public.distributor_purchase_orders where id = p_order_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  perform public.assert_pharmacy_inventory_access(v_order.pharmacy_id);
  if not public.owns_pharmacy(v_order.pharmacy_id) then raise exception 'Not authorized to receive for this pharmacy'; end if;
  select * into v_existing from public.distributor_goods_receipts where pharmacy_id = v_order.pharmacy_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id <> p_order_id or v_existing.request_hash <> v_hash then raise exception 'Receipt key was already used for different receipt data'; end if;
    return v_existing.id;
  end if;
  if v_order.status in ('received', 'cancelled') then raise exception 'This purchase order cannot receive more stock'; end if;
  insert into public.distributor_goods_receipts (order_id, pharmacy_id, idempotency_key, request_hash, received_by, notes)
  values (p_order_id, v_order.pharmacy_id, p_idempotency_key, v_hash, auth.uid(), nullif(pg_catalog.btrim(p_notes), ''))
  returning id into v_receipt_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if coalesce(v_line->>'order_item_id', '') !~* '^[0-9a-f-]{36}$' or coalesce(v_line->>'quantity_received', '') !~ '^[0-9]{1,7}$'
      or nullif(pg_catalog.btrim(v_line->>'batch_number'), '') is null or coalesce(v_line->>'expiry_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Each receipt line needs an order item, quantity, batch number, and expiry date';
    end if;
    v_quantity := (v_line->>'quantity_received')::integer;
    v_expiry := (v_line->>'expiry_date')::date;
    v_manufactured := nullif(v_line->>'manufacturing_date', '')::date;
    if v_quantity <= 0 then raise exception 'Received quantities must be greater than zero'; end if;
    if v_expiry < current_date then raise exception 'Expired batches cannot be added to inventory'; end if;
    if v_manufactured is not null and (v_manufactured > current_date or v_manufactured > v_expiry) then raise exception 'Check the manufacturing date'; end if;
    select * into v_order_item from public.distributor_purchase_order_items oi where oi.id = (v_line->>'order_item_id')::uuid and oi.order_id = p_order_id for update;
    if not found then raise exception 'A receipt item does not belong to this purchase order'; end if;
    v_remaining := v_order_item.quantity_ordered - v_order_item.quantity_received;
    if v_quantity > v_remaining then raise exception 'Received quantity exceeds the outstanding quantity'; end if;
    if exists (select 1 from public.distributor_goods_receipt_items ri where ri.order_item_id = v_order_item.id and ri.batch_number = pg_catalog.btrim(v_line->>'batch_number'))
      or exists (select 1 from public.medicine_batches b where b.pharmacy_id = v_order.pharmacy_id and b.medicine_id = v_order_item.medicine_id and b.batch_number = pg_catalog.btrim(v_line->>'batch_number')) then
      raise exception 'This batch number has already been received for this medicine';
    end if;
    v_selling := nullif(v_line->>'selling_price', '')::numeric;
    select i.selling_price into v_current_selling from public.inventory i where i.pharmacy_id = v_order.pharmacy_id and i.medicine_id = v_order_item.medicine_id;
    v_selling := coalesce(v_selling, v_current_selling, 0);
    if v_selling < 0 then raise exception 'Selling price cannot be negative'; end if;
    v_purchase_id := public.record_pharmacy_purchase(
      v_order.pharmacy_id, v_order_item.medicine_id, v_quantity, v_order_item.unit_price, v_selling,
      (select d.company_name from public.distributors d where d.id = v_order.distributor_id), null,
      pg_catalog.btrim(v_line->>'batch_number'), v_expiry,
      'Distributor order ' || left(p_order_id::text, 8) || '; receipt ' || left(v_receipt_id::text, 8)
        || case when nullif(pg_catalog.btrim(p_notes), '') is null then '' else '; ' || pg_catalog.btrim(p_notes) end,
      v_manufactured
    );
    insert into public.distributor_goods_receipt_items (
      receipt_id, order_id, order_item_id, quantity_received, batch_number, expiry_date, manufacturing_date, unit_cost, selling_price, purchase_id
    ) values (
      v_receipt_id, p_order_id, v_order_item.id, v_quantity, pg_catalog.btrim(v_line->>'batch_number'),
      v_expiry, v_manufactured, v_order_item.unit_price, v_selling, v_purchase_id
    );
    update public.distributor_purchase_order_items set quantity_received = quantity_received + v_quantity where id = v_order_item.id;
  end loop;
  if exists (select 1 from public.distributor_purchase_order_items oi where oi.order_id = p_order_id and oi.quantity_received < oi.quantity_ordered) then
    update public.distributor_purchase_orders set status = 'partially_received', updated_at = pg_catalog.now() where id = p_order_id;
  else update public.distributor_purchase_orders set status = 'received', updated_at = pg_catalog.now() where id = p_order_id; end if;
  return v_receipt_id;
end;
$$;

revoke all on function public.add_pharmacy_distributor(uuid, text, text, text, text, text, text, text, text[], text, text) from public, anon;
revoke all on function public.update_pharmacy_distributor(uuid, text, text, text, text, text, text, text, text[], text, text) from public, anon;
revoke all on function public.link_shared_distributor(uuid, uuid) from public, anon;
revoke all on function public.set_pharmacy_distributor_status(uuid, boolean, boolean) from public, anon;
revoke all on function public.save_pharmacy_distributor_medicine(uuid, uuid, numeric, integer, boolean) from public, anon;
revoke all on function public.create_distributor_purchase_order(uuid, jsonb, text) from public, anon;
revoke all on function public.update_distributor_purchase_order_status(uuid, text) from public, anon;
revoke all on function public.record_distributor_goods_receipt(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.add_pharmacy_distributor(uuid, text, text, text, text, text, text, text, text[], text, text) to authenticated;
grant execute on function public.update_pharmacy_distributor(uuid, text, text, text, text, text, text, text, text[], text, text) to authenticated;
grant execute on function public.link_shared_distributor(uuid, uuid) to authenticated;
grant execute on function public.set_pharmacy_distributor_status(uuid, boolean, boolean) to authenticated;
grant execute on function public.save_pharmacy_distributor_medicine(uuid, uuid, numeric, integer, boolean) to authenticated;
grant execute on function public.create_distributor_purchase_order(uuid, jsonb, text) to authenticated;
grant execute on function public.update_distributor_purchase_order_status(uuid, text) to authenticated;
grant execute on function public.record_distributor_goods_receipt(uuid, uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
