-- In a nested pharmacies query, an unqualified `name` resolves to
-- pharmacies.name. Qualify the outer storage.objects.name so the owner check
-- compares the pharmacy id against the uploaded object's path.
drop policy if exists "verification_files_owner_or_admin_read" on storage.objects;
create policy "verification_files_owner_or_admin_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'onecall-verification'
  and (
    public.is_admin()
    or (
      split_part(storage.objects.name, '/', 1) = (select auth.uid()::text)
      and exists (
        select 1
        from public.pharmacies p
        where p.id::text = split_part(storage.objects.name, '/', 2)
          and p.owner_user_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists "verification_files_owner_upload" on storage.objects;
create policy "verification_files_owner_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'onecall-verification'
  and split_part(storage.objects.name, '/', 1) = (select auth.uid()::text)
  and split_part(storage.objects.name, '/', 3) in ('aadhaar', 'pharmacy_license', 'owner_photo', 'shop_photo')
  and exists (
    select 1
    from public.pharmacies p
    where p.id::text = split_part(storage.objects.name, '/', 2)
      and p.owner_user_id = (select auth.uid())
  )
);

-- Keep the metadata insert's path and ownership checks explicit as well.
drop policy if exists "owner_submit_own_verification_documents" on public.pharmacy_verification_documents;
create policy "owner_submit_own_verification_documents"
on public.pharmacy_verification_documents for insert to authenticated
with check (
  public.pharmacy_verification_documents.owner_user_id = (select auth.uid())
  and split_part(public.pharmacy_verification_documents.storage_path, '/', 1) = (select auth.uid()::text)
  and split_part(public.pharmacy_verification_documents.storage_path, '/', 2) = public.pharmacy_verification_documents.pharmacy_id::text
  and split_part(public.pharmacy_verification_documents.storage_path, '/', 3) = public.pharmacy_verification_documents.document_type
  and exists (
    select 1
    from public.pharmacies p
    where p.id = public.pharmacy_verification_documents.pharmacy_id
      and p.owner_user_id = (select auth.uid())
  )
  and exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'onecall-verification'
      and o.name = public.pharmacy_verification_documents.storage_path
  )
);

notify pgrst, 'reload schema';
