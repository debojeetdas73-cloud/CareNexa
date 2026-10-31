-- OneCallPharmacy marketplace workflow extension
-- Apply after 202610050001_initial_pharmacy_inventory.sql.
create extension if not exists pgcrypto;

do $$ begin
  create type public.pharmacy_verification_status as enum ('pending','under_review','approved','rejected','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_fulfillment_choice as enum ('pickup','delivery');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists default_address text;

alter table public.pharmacies
  add column if not exists verification_status public.pharmacy_verification_status not null default 'pending',
  add column if not exists verification_note text,
  add column if not exists verified_at timestamptz,
  add column if not exists shop_photo_path text,
  add column if not exists license_number text,
  add column if not exists latitude_accuracy_m numeric;

alter table public.orders
  add column if not exists fulfillment_choice public.order_fulfillment_choice,
  add column if not exists customer_note text,
  add column if not exists pharmacy_note text,
  add column if not exists quoted_subtotal numeric(14,2),
  add column if not exists discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  add column if not exists final_total numeric(14,2),
  add column if not exists quote_message text,
  add column if not exists quote_sent_at timestamptz,
  add column if not exists customer_accepted_quote_at timestamptz,
  add column if not exists order_number text unique;

update public.orders set order_number = 'OC-' || upper(substr(replace(id::text,'-',''),1,10)) where order_number is null;
alter table public.orders alter column order_number set default ('OC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)));

create table if not exists public.pharmacy_verification_documents (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('aadhaar','pharmacy_license','shop_photo','owner_photo')),
  storage_path text not null,
  review_status public.pharmacy_verification_status not null default 'pending',
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  kind text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_verification_status on public.pharmacies(verification_status);
create index if not exists idx_notifications_recipient on public.notifications(recipient_user_id, created_at desc);
create index if not exists idx_orders_order_number on public.orders(order_number);

alter table public.pharmacy_verification_documents enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "owner_view_own_verification_documents" on public.pharmacy_verification_documents;
create policy "owner_view_own_verification_documents" on public.pharmacy_verification_documents for select
using (owner_user_id = auth.uid() or public.is_admin());
drop policy if exists "owner_submit_own_verification_documents" on public.pharmacy_verification_documents;
create policy "owner_submit_own_verification_documents" on public.pharmacy_verification_documents for insert
with check (owner_user_id = auth.uid() and exists (
  select 1 from public.pharmacies p where p.id = pharmacy_id and p.owner_user_id = auth.uid()
));
drop policy if exists "admin_review_verification_documents" on public.pharmacy_verification_documents;
create policy "admin_review_verification_documents" on public.pharmacy_verification_documents for update
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "notification_recipient_read" on public.notifications;
create policy "notification_recipient_read" on public.notifications for select using (recipient_user_id = auth.uid() or public.is_admin());
drop policy if exists "notification_recipient_update" on public.notifications;
create policy "notification_recipient_update" on public.notifications for update using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

-- Public pharmacy search should list only approved pharmacies.
drop policy if exists "active_pharmacies_public_read" on public.pharmacies;
create policy "active_pharmacies_public_read" on public.pharmacies for select
using ((is_active and verification_status = 'approved') or owner_user_id = auth.uid() or public.is_admin());

-- Only approved pharmacies may accept orders; the existing RPC is replaced with an approval check.
create or replace function public.place_pharmacy_order(
  p_pharmacy_id uuid, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_fulfillment public.fulfillment_type, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid; v_item jsonb; v_medicine_id uuid; v_qty integer;
  v_price numeric(12,2); v_cost numeric(12,2); v_available integer; v_subtotal numeric(14,2) := 0;
  v_owner uuid;
begin
  if nullif(trim(p_customer_name),'') is null or nullif(trim(p_customer_phone),'') is null then raise exception 'Customer name and phone are required'; end if;
  if p_fulfillment = 'delivery' and nullif(trim(p_delivery_address),'') is null then raise exception 'Delivery address is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one medicine'; end if;
  select owner_user_id into v_owner from public.pharmacies where id=p_pharmacy_id and is_active and verification_status='approved';
  if not found then raise exception 'This pharmacy is not verified or is unavailable'; end if;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'medicine_id' loop
    v_medicine_id := (v_item->>'medicine_id')::uuid; v_qty := (v_item->>'quantity')::integer;
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    select quantity_on_hand, selling_price, average_purchase_cost into v_available, v_price, v_cost
      from public.inventory where pharmacy_id=p_pharmacy_id and medicine_id=v_medicine_id for update;
    if not found or v_available < v_qty then raise exception 'Insufficient stock for one or more selected medicines'; end if;
    v_subtotal := v_subtotal + v_price*v_qty;
  end loop;

  insert into public.orders(pharmacy_id,customer_user_id,customer_name,customer_phone,delivery_address,fulfillment,fulfillment_choice,status,subtotal,quoted_subtotal,order_number)
  values(p_pharmacy_id,auth.uid(),trim(p_customer_name),trim(p_customer_phone),nullif(trim(p_delivery_address),''),p_fulfillment,
    case when p_fulfillment='pickup' then 'pickup'::public.order_fulfillment_choice else 'delivery'::public.order_fulfillment_choice end,
    'pending',v_subtotal,v_subtotal,'OC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)))
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_medicine_id := (v_item->>'medicine_id')::uuid; v_qty := (v_item->>'quantity')::integer;
    select selling_price,average_purchase_cost into v_price,v_cost from public.inventory where pharmacy_id=p_pharmacy_id and medicine_id=v_medicine_id for update;
    insert into public.order_items(order_id,medicine_id,quantity,unit_selling_price,unit_cost_snapshot) values(v_order_id,v_medicine_id,v_qty,v_price,v_cost);
  end loop;

  if v_owner is not null then
    insert into public.notifications(recipient_user_id,pharmacy_id,order_id,kind,title,message)
    values(v_owner,p_pharmacy_id,v_order_id,'new_order','New order received','A customer has requested medicines. Review availability and prepare a final quote.');
  end if;
  return v_order_id;
end $$;

-- Pharmacy owner submits a quote after accepting an order. Stock is reserved/deducted only on quote acceptance.
create or replace function public.pharmacy_quote_order(
  p_order_id uuid, p_final_total numeric, p_discount numeric default 0, p_message text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_item record; v_owner uuid; v_subtotal numeric(14,2):=0;
begin
  if p_final_total < 0 or p_discount < 0 then raise exception 'Price and discount cannot be negative'; end if;
  select o.* into v_order from public.orders o where o.id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not (public.owns_pharmacy(v_order.pharmacy_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  if v_order.status not in ('pending','confirmed','processing') then raise exception 'Order cannot be quoted in its current status'; end if;
  if p_discount > v_order.subtotal then raise exception 'Discount cannot exceed the indicative subtotal'; end if;
  if p_final_total > v_order.subtotal then raise exception 'Final total cannot exceed the indicative subtotal in this workflow'; end if;

  -- Deduct and record stock only once when the pharmacy issues its quote.
  if v_order.quoted_subtotal is null or v_order.quote_sent_at is null then
    for v_item in select * from public.order_items where order_id=p_order_id loop
      update public.inventory set quantity_on_hand=quantity_on_hand-v_item.quantity, updated_at=now()
      where pharmacy_id=v_order.pharmacy_id and medicine_id=v_item.medicine_id and quantity_on_hand>=v_item.quantity;
      if not found then raise exception 'Stock changed; insufficient quantity to confirm this order'; end if;
      insert into public.stock_movements(pharmacy_id,medicine_id,movement_type,quantity_change,unit_cost,unit_selling_price,reference_type,reference_id,created_by)
      values(v_order.pharmacy_id,v_item.medicine_id,'sale',-v_item.quantity,v_item.unit_cost_snapshot,v_item.unit_selling_price,'order',p_order_id,auth.uid());
    end loop;
  end if;
  update public.orders set status='confirmed', quoted_subtotal=subtotal, discount_amount=p_discount,
    final_total=p_final_total, quote_message=p_message, quote_sent_at=now(), updated_at=now()
  where id=p_order_id;
  if v_order.customer_user_id is not null then
    insert into public.notifications(recipient_user_id,pharmacy_id,order_id,kind,title,message)
    values(v_order.customer_user_id,v_order.pharmacy_id,p_order_id,'price_quote','Pharmacy sent your final price',
      'Your order '||v_order.order_number||' has a final price of ₹'||p_final_total::text||'. Review it in your order history.');
  end if;
end $$;

grant execute on function public.pharmacy_quote_order(uuid,numeric,numeric,text) to authenticated;

-- Order history is visible to the customer who placed it and the pharmacy that fulfills it.


-- Persist pharmacy reviews in the database rather than shipping demo reviews in the frontend.
create table if not exists public.pharmacy_reviews (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 5 and 500),
  created_at timestamptz not null default now()
);
alter table public.pharmacy_reviews enable row level security;
drop policy if exists "public_read_reviews_for_approved_pharmacies" on public.pharmacy_reviews;
create policy "public_read_reviews_for_approved_pharmacies" on public.pharmacy_reviews for select
using (exists(select 1 from public.pharmacies p where p.id=pharmacy_id and p.verification_status='approved' and p.is_active));
drop policy if exists "authenticated_customers_insert_reviews" on public.pharmacy_reviews;
create policy "authenticated_customers_insert_reviews" on public.pharmacy_reviews for insert
with check (auth.uid() is not null and (user_id is null or user_id=auth.uid()));
grant select, insert on public.pharmacy_reviews to anon, authenticated;
