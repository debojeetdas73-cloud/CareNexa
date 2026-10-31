-- Customer stock lookup returns only public marketplace details. Inventory
-- tables remain pharmacy-owner/admin only; customers never receive purchase cost.
create or replace view public.pharmacy_inventory_status
with (security_invoker = true)
as
select
  i.pharmacy_id, p.name as pharmacy_name, p.state, p.district, p.city,
  i.medicine_id, m.name as medicine_name, m.generic_name,
  i.quantity_on_hand, i.reorder_level, i.selling_price, i.average_purchase_cost,
  (i.quantity_on_hand <= i.reorder_level) as is_low_stock,
  coalesce(b.nearest_expiry, null) as nearest_expiry,
  m.brand_name, m.category, m.strength, m.dosage_form, m.pack_size, m.manufacturer,
  m.prescription_required
from public.inventory i
join public.pharmacies p on p.id = i.pharmacy_id
join public.medicines m on m.id = i.medicine_id
left join lateral (
  select min(mb.expiry_date) as nearest_expiry
  from public.medicine_batches mb
  where mb.pharmacy_id = i.pharmacy_id and mb.medicine_id = i.medicine_id
    and mb.quantity_remaining > 0 and mb.expiry_date is not null
) b on true;

create or replace function public.get_customer_medicine_stock(p_medicine_id uuid)
returns table (
  pharmacy_id uuid,
  pharmacy_name text,
  address text,
  phone text,
  city text,
  district text,
  state text,
  latitude double precision,
  longitude double precision,
  opening_time time,
  closing_time time,
  is_24_hours boolean,
  medicine_id uuid,
  medicine_name text,
  generic_name text,
  brand_name text,
  strength text,
  dosage_form text,
  pack_size text,
  quantity_on_hand integer,
  selling_price numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to see live pharmacy stock';
  end if;
  if p_medicine_id is null then
    raise exception 'Choose a medicine first';
  end if;

  return query
  select
    p.id,
    p.name,
    p.address,
    p.phone,
    p.city,
    p.district,
    p.state,
    p.latitude,
    p.longitude,
    p.opening_time,
    p.closing_time,
    p.is_24_hours,
    m.id,
    m.name,
    m.generic_name,
    m.brand_name,
    m.strength,
    m.dosage_form,
    m.pack_size,
    i.quantity_on_hand,
    i.selling_price
  from public.inventory i
  join public.pharmacies p on p.id = i.pharmacy_id
  join public.medicines m on m.id = i.medicine_id
  where i.medicine_id = p_medicine_id
    and i.quantity_on_hand > 0
    and i.selling_price > 0
    and p.is_active
    and p.verification_status = 'approved'
    and not m.prescription_required
  order by i.selling_price, p.name
  limit 100;
end;
$$;

revoke all on function public.get_customer_medicine_stock(uuid) from public, anon, authenticated;
grant execute on function public.get_customer_medicine_stock(uuid) to authenticated;

-- The OTC order RPC remains the source of truth for stock and price. Reject
-- prescription-only items even if a client bypasses the customer interface.
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
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before placing an order so you can review the pharmacy quote';
  end if;
  if nullif(trim(p_customer_name), '') is null or nullif(trim(p_customer_phone), '') is null then
    raise exception 'Customer name and phone are required';
  end if;
  if p_fulfillment = 'delivery' and nullif(trim(p_delivery_address), '') is null then
    raise exception 'Delivery address is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one medicine';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'An order can contain at most 50 medicine items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    group by item->>'medicine_id' having count(*) > 1
  ) then
    raise exception 'Each medicine can only appear once in an order';
  end if;

  select p.owner_user_id into v_owner
  from public.pharmacies p
  where p.id = p_pharmacy_id and p.is_active and p.verification_status = 'approved';
  if not found then
    raise exception 'This pharmacy is not verified or is unavailable';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) order by value->>'medicine_id'
  loop
    v_medicine_id := (v_item->>'medicine_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    if exists (
      select 1 from public.medicines m
      where m.id = v_medicine_id and m.prescription_required
    ) then
      raise exception 'Prescription-only medicines must use a prescription request';
    end if;

    select i.quantity_on_hand, i.selling_price, i.average_purchase_cost
    into v_available, v_price, v_cost
    from public.inventory i
    where i.pharmacy_id = p_pharmacy_id and i.medicine_id = v_medicine_id
    for update;
    if not found or v_available < v_qty then
      raise exception 'Insufficient stock for one or more selected medicines';
    end if;
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  insert into public.orders (
    pharmacy_id, customer_user_id, customer_name, customer_phone,
    delivery_address, fulfillment, fulfillment_choice, status, subtotal,
    quoted_subtotal, order_number
  )
  values (
    p_pharmacy_id, auth.uid(), trim(p_customer_name), trim(p_customer_phone),
    nullif(trim(p_delivery_address), ''), p_fulfillment,
    case when p_fulfillment = 'pickup' then 'pickup'::public.order_fulfillment_choice
      else 'delivery'::public.order_fulfillment_choice end,
    'pending', v_subtotal, v_subtotal,
    'OC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_medicine_id := (v_item->>'medicine_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    select i.selling_price, i.average_purchase_cost
    into v_price, v_cost
    from public.inventory i
    where i.pharmacy_id = p_pharmacy_id and i.medicine_id = v_medicine_id
    for update;

    insert into public.order_items(order_id, medicine_id, quantity, unit_selling_price, unit_cost_snapshot)
    values (v_order_id, v_medicine_id, v_qty, v_price, v_cost);
  end loop;

  if v_owner is not null then
    insert into public.notifications(recipient_user_id, pharmacy_id, order_id, kind, title, message)
    values (
      v_owner, p_pharmacy_id, v_order_id, 'new_order', 'New order received',
      'A customer has requested medicines. Review availability and prepare a final quote.'
    );
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.place_pharmacy_order(uuid, text, text, text, public.fulfillment_type, jsonb) from public, anon;
grant execute on function public.place_pharmacy_order(uuid, text, text, text, public.fulfillment_type, jsonb) to authenticated;

notify pgrst, 'reload schema';
