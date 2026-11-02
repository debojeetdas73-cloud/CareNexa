-- Membership system for CareNexa (demo)

-- Membership plans
create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(10,2) not null default 0 check (price >= 0),
  duration_months integer not null default 1 check (duration_months > 0),
  features text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.membership_plans enable row level security;

drop policy if exists "Public can view active membership plans" on public.membership_plans;
create policy "Public can view active membership plans"
  on public.membership_plans for select
  to anon, authenticated
  using (is_active = true);

grant select on public.membership_plans to anon, authenticated;

-- Customer memberships
create table if not exists public.customer_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  payment_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_memberships enable row level security;

drop policy if exists "Customers can view own memberships" on public.customer_memberships;
create policy "Customers can view own memberships"
  on public.customer_memberships for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Customers can insert own memberships" on public.customer_memberships;
create policy "Customers can insert own memberships"
  on public.customer_memberships for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Admins can manage all memberships" on public.customer_memberships;
create policy "Admins can manage all memberships"
  on public.customer_memberships for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.customer_memberships to authenticated;
grant insert on public.customer_memberships to authenticated;

-- Pharmacy memberships
create table if not exists public.pharmacy_memberships (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  payment_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pharmacy_memberships enable row level security;

drop policy if exists "Pharmacy owners can view own memberships" on public.pharmacy_memberships;
create policy "Pharmacy owners can view own memberships"
  on public.pharmacy_memberships for select
  to authenticated
  using (exists (
    select 1 from public.pharmacies p where p.id = pharmacy_memberships.pharmacy_id and p.owner_user_id = auth.uid()
  ));

drop policy if exists "Pharmacy owners can insert own memberships" on public.pharmacy_memberships;
create policy "Pharmacy owners can insert own memberships"
  on public.pharmacy_memberships for insert
  to authenticated
  with check (exists (
    select 1 from public.pharmacies p where p.id = pharmacy_memberships.pharmacy_id and p.owner_user_id = auth.uid()
  ));

drop policy if exists "Admins can manage pharmacy memberships" on public.pharmacy_memberships;
create policy "Admins can manage pharmacy memberships"
  on public.pharmacy_memberships for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.pharmacy_memberships to authenticated;
grant insert on public.pharmacy_memberships to authenticated;

-- Seed membership plans
insert into public.membership_plans (name, price, duration_months, features, is_active) values
  ('Zero', 0, 1, ARRAY['Basic hospital search', 'Pharmacy search', 'Order medicines', 'View profile'], true),
  ('Silver', 99, 1, ARRAY['AI Assistant access', 'Priority hospital listings', 'Disease-based hospital recommendations', 'Basic health insights'], true)
on conflict (name) do nothing;