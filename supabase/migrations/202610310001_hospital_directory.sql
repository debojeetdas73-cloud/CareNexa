-- OneCallPharmacy Hospital Directory

create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hospital_type text,
  state text not null,
  district text not null,
  city text not null,
  address text not null,
  phone text,
  email text,
  website text,
  image_url text,
  banner_url text,
  about text,
  rating numeric(2,1)
    check (rating is null or (rating >= 0 and rating <= 5)),
  review_count integer not null default 0
    check (review_count >= 0),
  bed_count integer
    check (bed_count is null or bed_count >= 0),
  established_year integer,
  departments text[] not null default '{}',
  facilities text[] not null default '{}',
  services text[] not null default '{}',
  doctors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(doctors) = 'array'),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hospitals_status_city_idx
on public.hospitals (status, city);

create index if not exists hospitals_name_search_idx
on public.hospitals using gin (
  to_tsvector(
    'simple',
    coalesce(name,'') || ' ' ||
    coalesce(city,'') || ' ' ||
    coalesce(district,'')
  )
);

alter table public.hospitals enable row level security;

drop policy if exists
"Public can view approved hospitals"
on public.hospitals;

create policy "Public can view approved hospitals"
on public.hospitals
for select
to anon, authenticated
using (status = 'approved');

drop policy if exists
"Admins can manage hospitals"
on public.hospitals;

create policy "Admins can manage hospitals"
on public.hospitals
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.hospitals to anon, authenticated;

grant insert, update, delete
on public.hospitals to authenticated;