-- Reapply the private pharmacy verification bucket and its owner upload policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'onecall-verification',
  'onecall-verification',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "verification_files_owner_upload" on storage.objects;
create policy "verification_files_owner_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'onecall-verification'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 3) in ('aadhaar', 'pharmacy_license', 'owner_photo', 'shop_photo')
  and exists (
    select 1
    from public.pharmacies p
    where p.id::text = split_part(name, '/', 2)
      and p.owner_user_id = auth.uid()
  )
);
