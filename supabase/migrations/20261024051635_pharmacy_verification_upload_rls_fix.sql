-- Storage's upload response returns the inserted storage.objects row. Keep a
-- matching SELECT policy so owners can receive metadata for their own upload.
drop policy if exists "verification_files_owner_or_admin_read" on storage.objects;
create policy "verification_files_owner_or_admin_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'onecall-verification'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      and exists (
        select 1
        from public.pharmacies p
        where p.id::text = (storage.foldername(name))[2]
          and p.owner_user_id = (select auth.uid())
      )
    )
  )
);

-- Match the upload path to the authenticated pharmacy owner and document type.
drop policy if exists "verification_files_owner_upload" on storage.objects;
create policy "verification_files_owner_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'onecall-verification'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[3] in ('aadhaar', 'pharmacy_license', 'owner_photo', 'shop_photo')
  and exists (
    select 1
    from public.pharmacies p
    where p.id::text = (storage.foldername(name))[2]
      and p.owner_user_id = (select auth.uid())
  )
);

-- The metadata insert checks that the uploaded object exists. The SELECT policy
-- above makes that check visible to the same owner without exposing other files.
drop policy if exists "owner_submit_own_verification_documents" on public.pharmacy_verification_documents;
create policy "owner_submit_own_verification_documents"
on public.pharmacy_verification_documents for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and (storage.foldername(storage_path))[1] = (select auth.uid()::text)
  and (storage.foldername(storage_path))[2] = pharmacy_id::text
  and (storage.foldername(storage_path))[3] = document_type
  and exists (
    select 1
    from public.pharmacies p
    where p.id = pharmacy_id
      and p.owner_user_id = (select auth.uid())
  )
  and exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'onecall-verification'
      and o.name = storage_path
  )
);

notify pgrst, 'reload schema';
