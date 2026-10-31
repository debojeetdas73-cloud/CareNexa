create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.prescription_orders
  alter column pharmacy_id drop not null,
  add column if not exists fulfillment_choice public.order_fulfillment_choice not null default 'delivery',
  add column if not exists delivery_address text,
  add column if not exists customer_latitude double precision,
  add column if not exists customer_longitude double precision,
  add column if not exists search_round integer not null default 1,
  add column if not exists search_expires_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_distance_km numeric(8,2),
  add column if not exists order_id uuid references public.orders(id) on delete set null;

alter table public.prescription_orders drop constraint if exists prescription_orders_status_check;
update public.prescription_orders
set status = case when status = 'reviewed' then 'accepted' else 'needs_resend' end,
    accepted_at = case when status = 'reviewed' then coalesce(reviewed_at, created_at) else accepted_at end;
alter table public.prescription_orders
  alter column status set default 'searching',
  add constraint prescription_orders_status_check
    check (status in ('searching', 'needs_resend', 'accepted', 'quoted', 'confirmed', 'completed', 'cancelled'));

alter table public.orders
  add column if not exists prescription_order_id uuid references public.prescription_orders(id) on delete set null;
create index if not exists orders_prescription_order_idx on public.orders (prescription_order_id) where prescription_order_id is not null;
create index if not exists prescription_orders_search_idx on public.prescription_orders (status, search_expires_at);

alter table public.notifications
  add column if not exists prescription_order_id uuid references public.prescription_orders(id) on delete cascade;

create table if not exists public.prescription_offers (
  id uuid primary key default gen_random_uuid(),
  prescription_order_id uuid not null references public.prescription_orders(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  distance_km numeric(8,2),
  fulfillment_choice public.order_fulfillment_choice not null,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'rejected', 'expired')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (prescription_order_id, round_number, pharmacy_id)
);

create index if not exists prescription_offers_pharmacy_status_idx
  on public.prescription_offers (pharmacy_id, status, created_at desc);
create index if not exists prescription_offers_request_idx
  on public.prescription_offers (prescription_order_id, round_number, status);

alter table public.prescription_offers enable row level security;
drop policy if exists "prescription_orders_customer_or_pharmacy_read" on public.prescription_orders;
create policy "prescription_orders_customer_or_pharmacy_read"
  on public.prescription_orders for select to authenticated
  using (
    customer_user_id = (select auth.uid())
    or public.is_admin()
    or (
      pharmacy_id is not null
      and public.owns_pharmacy(pharmacy_id)
      and status in ('accepted', 'quoted', 'confirmed', 'completed')
    )
  );

drop policy if exists "prescription_offers_customer_or_pharmacy_read" on public.prescription_offers;
create policy "prescription_offers_customer_or_pharmacy_read"
  on public.prescription_offers for select to authenticated
  using (
    public.owns_pharmacy(pharmacy_id)
    or public.is_admin()
    or exists (
      select 1 from public.prescription_orders r
      where r.id = prescription_order_id
        and r.customer_user_id = (select auth.uid())
    )
  );

revoke all on public.prescription_orders from anon, authenticated;
grant select on public.prescription_orders to authenticated;
revoke all on public.prescription_offers from anon, authenticated;
grant select on public.prescription_offers to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onecall-prescriptions', 'onecall-prescriptions', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "prescription_files_customer_or_pharmacy_read" on storage.objects;
create policy "prescription_files_customer_or_pharmacy_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'onecall-prescriptions'
    and (
      split_part(storage.objects.name, '/', 1) = (select auth.uid()::text)
      or exists (
        select 1 from public.prescription_orders r
        where r.storage_path = storage.objects.name
          and r.pharmacy_id is not null
          and public.owns_pharmacy(r.pharmacy_id)
          and r.status in ('accepted', 'quoted', 'confirmed', 'completed')
      )
      or public.is_admin()
    )
  );

drop policy if exists "customers_upload_own_prescriptions" on storage.objects;
create policy "customers_upload_own_prescriptions"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'onecall-prescriptions'
    and split_part(storage.objects.name, '/', 1) = (select auth.uid()::text)
    and split_part(storage.objects.name, '/', 2) <> ''
  );

drop policy if exists "customers_delete_own_prescriptions" on storage.objects;
create policy "customers_delete_own_prescriptions"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'onecall-prescriptions'
    and split_part(storage.objects.name, '/', 1) = (select auth.uid()::text)
  );

create or replace function private.dispatch_prescription_order(
  p_request_id uuid,
  p_round_number integer,
  p_specific_pharmacy_id uuid default null,
  p_excluded_pharmacy_id uuid default null
)
returns integer
language plpgsql
set search_path = public, private
as $$
declare
  v_request public.prescription_orders%rowtype;
  v_count integer := 0;
begin
  select * into v_request from public.prescription_orders where id = p_request_id;
  if not found then raise exception 'Prescription request not found'; end if;

  if p_specific_pharmacy_id is not null and not exists (
    select 1 from public.pharmacies p
    where p.id = p_specific_pharmacy_id and p.is_active and p.verification_status = 'approved'
  ) then
    raise exception 'Choose an active, approved pharmacy';
  end if;

  with inserted_offers as (
    insert into public.prescription_offers (
      prescription_order_id, pharmacy_id, round_number, distance_km,
      fulfillment_choice, expires_at
    )
    select
      v_request.id,
      nearby.id,
      p_round_number,
      nearby.distance_km,
      v_request.fulfillment_choice,
      v_request.search_expires_at
    from (
      select
        p.id,
        round((6371 * acos(least(1, greatest(-1,
          sin(radians(v_request.customer_latitude)) * sin(radians(p.latitude))
          + cos(radians(v_request.customer_latitude)) * cos(radians(p.latitude))
          * cos(radians(p.longitude - v_request.customer_longitude))
        ))))::numeric, 2) as distance_km
      from public.pharmacies p
      where p.is_active
        and p.verification_status = 'approved'
        and p.owner_user_id is not null
        and p.latitude is not null
        and p.longitude is not null
        and (p_specific_pharmacy_id is null or p.id = p_specific_pharmacy_id)
        and (p_excluded_pharmacy_id is null or p.id <> p_excluded_pharmacy_id)
    ) nearby
    where p_specific_pharmacy_id is not null or nearby.distance_km <= 15
    on conflict (prescription_order_id, round_number, pharmacy_id) do nothing
    returning prescription_order_id, pharmacy_id, fulfillment_choice, distance_km
  ), inserted_notifications as (
    insert into public.notifications (
      recipient_user_id, pharmacy_id, prescription_order_id, kind, title, message
    )
    select p.owner_user_id, o.pharmacy_id, o.prescription_order_id,
      'new_prescription', 'Nearby prescription request',
      'A customer needs ' || o.fulfillment_choice::text || ' service ' || o.distance_km::text
        || ' km away. Open Orders to claim it.'
    from inserted_offers o
    join public.pharmacies p on p.id = o.pharmacy_id
    returning id
  )
  select count(*)::integer into v_count from inserted_offers;

  return v_count;
end;
$$;
revoke all on function private.dispatch_prescription_order(uuid, integer, uuid, uuid) from public, anon, authenticated;

create or replace function public.submit_prescription_broadcast(
  p_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_storage_path text,
  p_fulfillment public.order_fulfillment_choice,
  p_delivery_address text,
  p_customer_latitude double precision,
  p_customer_longitude double precision
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in before sending a prescription'; end if;
  if p_request_id is null or nullif(trim(p_customer_name), '') is null or nullif(trim(p_customer_phone), '') is null then
    raise exception 'Request id, customer name and phone are required';
  end if;
  if p_fulfillment is null then raise exception 'Choose pickup or delivery'; end if;
  if p_fulfillment = 'delivery' and nullif(trim(p_delivery_address), '') is null then
    raise exception 'Enter a delivery address';
  end if;
  if p_customer_latitude is null or p_customer_latitude not between -90 and 90
     or p_customer_longitude is null or p_customer_longitude not between -180 and 180 then
    raise exception 'Share your current location to find nearby pharmacies';
  end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text
     or not exists (
       select 1 from storage.objects so
       where so.bucket_id = 'onecall-prescriptions' and so.name = p_storage_path
     ) then
    raise exception 'Upload the prescription image before sending the request';
  end if;

  insert into public.prescription_orders (
    id, pharmacy_id, customer_user_id, customer_name, customer_phone, notes,
    storage_path, status, fulfillment_choice, delivery_address,
    customer_latitude, customer_longitude, search_round, search_expires_at
  ) values (
    p_request_id, null, auth.uid(), trim(p_customer_name), trim(p_customer_phone),
    nullif(trim(p_notes), ''), p_storage_path, 'searching', p_fulfillment,
    case when p_fulfillment = 'delivery' then trim(p_delivery_address) else null end,
    p_customer_latitude, p_customer_longitude, 1, now() + interval '5 minutes'
  );

  v_count := private.dispatch_prescription_order(p_request_id, 1);
  if v_count = 0 then
    update public.prescription_orders set status = 'needs_resend' where id = p_request_id;
  end if;
  return v_count;
end;
$$;
revoke all on function public.submit_prescription_broadcast(uuid, text, text, text, text, public.order_fulfillment_choice, text, double precision, double precision) from public, anon;
grant execute on function public.submit_prescription_broadcast(uuid, text, text, text, text, public.order_fulfillment_choice, text, double precision, double precision) to authenticated;

create or replace function public.pharmacy_claim_prescription(p_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.prescription_offers%rowtype;
  v_request public.prescription_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in as a pharmacy owner to accept this request'; end if;
  select * into v_offer from public.prescription_offers where id = p_offer_id;
  if not found or not public.owns_pharmacy(v_offer.pharmacy_id) then raise exception 'This pharmacy offer is unavailable'; end if;
  select * into v_request from public.prescription_orders where id = v_offer.prescription_order_id for update;
  if not found then raise exception 'Prescription request not found'; end if;
  select * into v_offer from public.prescription_offers where id = p_offer_id for update;
  if v_offer.status <> 'offered' or v_request.status <> 'searching' then raise exception 'Another pharmacy has already accepted this request'; end if;

  if v_request.search_expires_at <= now() then
    update public.prescription_offers set status = 'expired', responded_at = now()
    where prescription_order_id = v_request.id and status = 'offered';
    update public.prescription_orders set status = 'needs_resend' where id = v_request.id;
    return false;
  end if;
  if not exists (
    select 1 from public.pharmacies p
    where p.id = v_offer.pharmacy_id and p.is_active and p.verification_status = 'approved'
  ) then raise exception 'Only an active, approved pharmacy can accept a prescription'; end if;

  update public.prescription_orders
  set status = 'accepted', pharmacy_id = v_offer.pharmacy_id,
      accepted_at = now(), accepted_distance_km = v_offer.distance_km
  where id = v_request.id;
  update public.prescription_offers set status = 'accepted', responded_at = now() where id = p_offer_id;
  update public.prescription_offers set status = 'expired', responded_at = now()
  where prescription_order_id = v_request.id and id <> p_offer_id and status = 'offered';
  insert into public.notifications (recipient_user_id, pharmacy_id, prescription_order_id, kind, title, message)
  values (v_request.customer_user_id, v_offer.pharmacy_id, v_request.id,
    'prescription_accepted', 'A pharmacy accepted your prescription',
    'The pharmacy is reviewing your prescription. We will show the quote in your order history.');
  return true;
end;
$$;
revoke all on function public.pharmacy_claim_prescription(uuid) from public, anon;
grant execute on function public.pharmacy_claim_prescription(uuid) to authenticated;

create or replace function public.pharmacy_reject_prescription(p_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.prescription_offers%rowtype;
  v_request public.prescription_orders%rowtype;
  v_has_offers boolean;
begin
  if auth.uid() is null then raise exception 'Sign in as a pharmacy owner to respond'; end if;
  select * into v_offer from public.prescription_offers where id = p_offer_id;
  if not found or not public.owns_pharmacy(v_offer.pharmacy_id) then raise exception 'This pharmacy offer is unavailable'; end if;
  select * into v_request from public.prescription_orders where id = v_offer.prescription_order_id for update;
  select * into v_offer from public.prescription_offers where id = p_offer_id for update;
  if v_offer.status <> 'offered' or v_request.status <> 'searching' then raise exception 'This prescription offer is no longer available'; end if;

  update public.prescription_offers set status = 'rejected', responded_at = now() where id = p_offer_id;
  select exists (
    select 1 from public.prescription_offers
    where prescription_order_id = v_request.id and status = 'offered'
  ) and v_request.search_expires_at > now() into v_has_offers;

  if not v_has_offers then
    update public.prescription_offers set status = 'expired', responded_at = now()
    where prescription_order_id = v_request.id and status = 'offered';
    update public.prescription_orders set status = 'needs_resend' where id = v_request.id;
    insert into public.notifications (recipient_user_id, prescription_order_id, kind, title, message)
    values (v_request.customer_user_id, v_request.id, 'prescription_no_acceptance',
      'No nearby pharmacy accepted yet', 'You can resend the request or choose a pharmacy directly from your account.');
  end if;
  return v_has_offers;
end;
$$;
revoke all on function public.pharmacy_reject_prescription(uuid) from public, anon;
grant execute on function public.pharmacy_reject_prescription(uuid) to authenticated;

create or replace function public.customer_retry_prescription_order(
  p_request_id uuid,
  p_pharmacy_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_request public.prescription_orders%rowtype;
  v_order_status public.order_status;
  v_next_round integer;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to retry a prescription request'; end if;
  select * into v_request from public.prescription_orders where id = p_request_id for update;
  if not found or v_request.customer_user_id <> auth.uid() then raise exception 'Prescription request not found'; end if;
  if v_request.status = 'searching' and v_request.search_expires_at > now() then
    raise exception 'The nearby search is still active';
  end if;
  if v_request.status not in ('needs_resend', 'searching', 'quoted') then
    raise exception 'This prescription request cannot be resent yet';
  end if;
  if v_request.order_id is not null then
    select status into v_order_status from public.orders where id = v_request.order_id;
    if v_order_status is distinct from 'cancelled' then
      raise exception 'This quoted prescription order is still active';
    end if;
  end if;

  update public.prescription_offers set status = 'expired', responded_at = now()
  where prescription_order_id = v_request.id and status in ('offered', 'accepted');
  v_next_round := v_request.search_round + 1;
  update public.prescription_orders
  set status = 'searching', pharmacy_id = null, order_id = null,
      accepted_at = null, accepted_distance_km = null,
      search_round = v_next_round, search_expires_at = now() + interval '5 minutes'
  where id = v_request.id;

  v_count := private.dispatch_prescription_order(v_request.id, v_next_round, p_pharmacy_id);
  if v_count = 0 then update public.prescription_orders set status = 'needs_resend' where id = v_request.id; end if;
  return v_count;
end;
$$;
revoke all on function public.customer_retry_prescription_order(uuid, uuid) from public, anon;
grant execute on function public.customer_retry_prescription_order(uuid, uuid) to authenticated;

create or replace function public.pharmacy_release_prescription(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_request public.prescription_orders%rowtype;
  v_previous_pharmacy uuid;
  v_next_round integer;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in as a pharmacy owner to release this request'; end if;
  select * into v_request from public.prescription_orders where id = p_request_id for update;
  if not found or v_request.pharmacy_id is null or not public.owns_pharmacy(v_request.pharmacy_id) then
    raise exception 'This prescription request is not assigned to your pharmacy';
  end if;
  if v_request.status <> 'accepted' or v_request.order_id is not null then
    raise exception 'Only an unquoted prescription can be passed to another pharmacy';
  end if;
  v_previous_pharmacy := v_request.pharmacy_id;
  update public.prescription_offers set status = 'rejected', responded_at = now()
  where prescription_order_id = v_request.id and pharmacy_id = v_previous_pharmacy and status = 'accepted';
  v_next_round := v_request.search_round + 1;
  update public.prescription_orders
  set status = 'searching', pharmacy_id = null, accepted_at = null,
      accepted_distance_km = null, search_round = v_next_round,
      search_expires_at = now() + interval '5 minutes'
  where id = v_request.id;
  v_count := private.dispatch_prescription_order(v_request.id, v_next_round, null, v_previous_pharmacy);
  if v_count = 0 then
    update public.prescription_orders set status = 'needs_resend' where id = v_request.id;
    insert into public.notifications (recipient_user_id, prescription_order_id, kind, title, message)
    values (v_request.customer_user_id, v_request.id, 'prescription_no_acceptance',
      'No other nearby pharmacy is available', 'Choose a pharmacy directly from your account to continue.');
  else
    insert into public.notifications (recipient_user_id, prescription_order_id, kind, title, message)
    values (v_request.customer_user_id, v_request.id, 'prescription_reassigned',
      'Your prescription was sent to other nearby pharmacies', 'Another pharmacy will review your prescription shortly.');
  end if;
  return v_count;
end;
$$;
revoke all on function public.pharmacy_release_prescription(uuid) from public, anon;
grant execute on function public.pharmacy_release_prescription(uuid) to authenticated;

create or replace function public.pharmacy_quote_prescription_order(
  p_request_id uuid,
  p_items jsonb,
  p_discount numeric default 0,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.prescription_orders%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_medicine_id uuid;
  v_quantity integer;
  v_available integer;
  v_price numeric(12,2);
  v_cost numeric(12,2);
  v_subtotal numeric(14,2) := 0;
begin
  if auth.uid() is null then raise exception 'Sign in as a pharmacy owner to quote this prescription'; end if;
  select * into v_request from public.prescription_orders where id = p_request_id for update;
  if not found or v_request.status <> 'accepted' or v_request.order_id is not null then
    raise exception 'This prescription is not ready for a quote';
  end if;
  if v_request.pharmacy_id is null or not public.owns_pharmacy(v_request.pharmacy_id) then
    raise exception 'This prescription belongs to another pharmacy';
  end if;
  if not exists (
    select 1 from public.pharmacies p
    where p.id = v_request.pharmacy_id and p.is_active and p.verification_status = 'approved'
  ) then raise exception 'Only an active, approved pharmacy can quote a prescription'; end if;
  if p_discount is null or p_discount < 0 or p_discount <> round(p_discount, 2) then
    raise exception 'Enter a discount of zero or greater with up to two decimal places';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one available medicine';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    group by item->>'medicine_id' having count(*) > 1
  ) then raise exception 'Each medicine can only appear once in the quote'; end if;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'medicine_id'
  loop
    v_medicine_id := (v_item->>'medicine_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Medicine quantities must be greater than zero'; end if;
    select i.quantity_on_hand, i.selling_price
    into v_available, v_price
    from public.inventory i
    where i.pharmacy_id = v_request.pharmacy_id and i.medicine_id = v_medicine_id
    for update;
    if not found or v_available < v_quantity then raise exception 'Stock changed; update the prescription quote'; end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
  end loop;
  if p_discount > v_subtotal then raise exception 'Discount cannot exceed the order subtotal'; end if;

  insert into public.orders (
    pharmacy_id, customer_user_id, customer_name, customer_phone,
    delivery_address, fulfillment, fulfillment_choice, customer_note,
    status, subtotal, quoted_subtotal, order_number, prescription_order_id
  ) values (
    v_request.pharmacy_id, v_request.customer_user_id, v_request.customer_name,
    v_request.customer_phone, v_request.delivery_address,
    v_request.fulfillment_choice::text::public.fulfillment_type,
    v_request.fulfillment_choice, v_request.notes, 'pending', v_subtotal, v_subtotal,
    'OC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_request.id
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'medicine_id'
  loop
    v_medicine_id := (v_item->>'medicine_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    select i.selling_price, i.average_purchase_cost
    into v_price, v_cost
    from public.inventory i
    where i.pharmacy_id = v_request.pharmacy_id and i.medicine_id = v_medicine_id;
    insert into public.order_items (order_id, medicine_id, quantity, unit_selling_price, unit_cost_snapshot)
    values (v_order_id, v_medicine_id, v_quantity, v_price, v_cost);
  end loop;

  perform public.pharmacy_quote_order(
    v_order_id,
    round(v_subtotal - p_discount, 2),
    p_discount,
    nullif(trim(p_message), '')
  );
  update public.prescription_orders set status = 'quoted', order_id = v_order_id where id = v_request.id;
  return v_order_id;
end;
$$;
revoke all on function public.pharmacy_quote_prescription_order(uuid, jsonb, numeric, text) from public, anon;
grant execute on function public.pharmacy_quote_prescription_order(uuid, jsonb, numeric, text) to authenticated;

create or replace function private.sync_prescription_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.prescription_order_id is not null then
    update public.prescription_orders
    set status = case new.status::text
      when 'confirmed' then 'confirmed'
      when 'completed' then 'completed'
      when 'cancelled' then 'needs_resend'
      when 'rejected' then 'needs_resend'
      else 'confirmed'
    end
    where id = new.prescription_order_id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_prescription_order_status() from public, anon, authenticated;
drop trigger if exists sync_prescription_order_status on public.orders;
create trigger sync_prescription_order_status
  after update of status on public.orders
  for each row
  when (new.prescription_order_id is not null and new.status is distinct from old.status)
  execute function private.sync_prescription_order_status();

do $$
declare
  v_publication_all_tables boolean;
begin
  select puballtables into v_publication_all_tables
  from pg_publication where pubname = 'supabase_realtime';
  if found and not v_publication_all_tables then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prescription_offers'
    ) then
      execute 'alter publication supabase_realtime add table public.prescription_offers';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
