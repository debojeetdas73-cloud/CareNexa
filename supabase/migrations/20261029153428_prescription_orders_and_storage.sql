
create table if not exists public.prescription_orders (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null check (nullif(trim(customer_name), '') is not null),
  customer_phone text not null check (nullif(trim(customer_phone), '') is not null),
  notes text,
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint prescription_storage_path_owner check (split_part(storage_path, '/', 1) = customer_user_id::text)
);

create index if not exists prescription_orders_pharmacy_created_idx
  on public.prescription_orders (pharmacy_id, created_at desc);
create index if not exists prescription_orders_customer_created_idx
  on public.prescription_orders (customer_user_id, created_at desc);

alter table public.prescription_orders enable row level security;

drop policy if exists "prescription_orders_customer_or_pharmacy_read" on public.prescription_orders;
create policy "prescription_orders_customer_or_pharmacy_read"
  on public.prescription_orders for select to authenticated
  using (
    customer_user_id = (select auth.uid())
    or public.owns_pharmacy(pharmacy_id)
    or public.is_admin()
  );

drop policy if exists "customers_create_prescription_orders" on public.prescription_orders;
create policy "customers_create_prescription_orders"
  on public.prescription_orders for insert to authenticated
  with check (
    customer_user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_at is null
    and exists (
      select 1 from public.pharmacies p
      where p.id = pharmacy_id
        and p.is_active
        and p.verification_status = 'approved'
    )
  );

drop policy if exists "pharmacy_owners_review_prescription_orders" on public.prescription_orders;
create policy "pharmacy_owners_review_prescription_orders"
  on public.prescription_orders for update to authenticated
  using (
    public.owns_pharmacy(pharmacy_id)
    and exists (
      select 1 from public.pharmacies p
      where p.id = pharmacy_id
        and p.is_active
        and p.verification_status = 'approved'
    )
  )
  with check (
    public.owns_pharmacy(pharmacy_id)
    and status = 'reviewed'
    and reviewed_at is not null
    and exists (
      select 1 from public.pharmacies p
      where p.id = pharmacy_id
        and p.is_active
        and p.verification_status = 'approved'
    )
  );

revoke all on public.prescription_orders from anon, authenticated;
grant select, insert on public.prescription_orders to authenticated;
grant update (status, reviewed_at) on public.prescription_orders to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'onecall-prescriptions',
  'onecall-prescriptions',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "prescription_files_customer_or_pharmacy_read" on storage.objects;
create policy "prescription_files_customer_or_pharmacy_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'onecall-prescriptions'
    and exists (
      select 1 from public.prescription_orders r
      where r.storage_path = storage.objects.name
        and (
          r.customer_user_id = (select auth.uid())
          or public.owns_pharmacy(r.pharmacy_id)
          or public.is_admin()
        )
    )
  );

drop policy if exists "customers_upload_own_prescriptions" on storage.objects;
create policy "customers_upload_own_prescriptions"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'onecall-prescriptions'
    and split_part(storage.objects.name, '/', 1) = (select auth.uid()::text)
  );

drop policy if exists "customers_delete_own_prescriptions" on storage.objects;
create policy "customers_delete_own_prescriptions"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'onecall-prescriptions'
    and split_part(storage.objects.name, '/', 1) = (select auth.uid()::text)
  );

notify pgrst, 'reload schema';
