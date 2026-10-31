-- Customer submissions stay pending until the pharmacy reviews them and sends
-- a quote. Keep medicine-price values out of the customer UI before that step.
-- Every stocked catalogue item can be requested; the pharmacy review remains
-- the decision point before the quoted amount is shown to the customer.
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
    raise exception 'Sign in before sending a medicine request';
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
    raise exception 'A request can contain at most 50 medicine items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    group by item->>'medicine_id' having count(*) > 1
  ) then
    raise exception 'Each medicine can only appear once in a request';
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
      v_owner, p_pharmacy_id, v_order_id, 'new_order', 'New medicine request',
      'A customer requested medicines. Review the request and send a price quote.'
    );
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.place_pharmacy_order(uuid, text, text, text, public.fulfillment_type, jsonb) from public, anon;
grant execute on function public.place_pharmacy_order(uuid, text, text, text, public.fulfillment_type, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- The customer app now uses the quantity-only stock lookup above. Disable the
-- earlier price-returning lookup so it cannot expose a pre-quote price.
revoke all on function public.get_customer_medicine_stock(uuid) from public, anon, authenticated;
