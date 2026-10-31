-- Apply after 202610100001_admin_console_and_verification.sql.
-- Keeps pharmacy order actions, stock reservations, customer quote decisions,
-- and admin inventory/customer reporting on the same workflow.

create or replace function public.restore_pharmacy_order_stock(
  p_order_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement record;
begin
  if not exists (
    select 1
    from public.stock_movements sm
    where sm.reference_type = 'order'
      and sm.reference_id = p_order_id
      and sm.movement_type = 'sale'
      and sm.quantity_change < 0
  ) then
    raise exception 'No reserved stock movements were found for this order';
  end if;

  for v_movement in
    select sm.*
    from public.stock_movements sm
    where sm.reference_type = 'order'
      and sm.reference_id = p_order_id
      and sm.movement_type = 'sale'
      and sm.quantity_change < 0
    order by sm.id
    for update
  loop
    update public.inventory
    set quantity_on_hand = quantity_on_hand + abs(v_movement.quantity_change),
        updated_at = now()
    where pharmacy_id = v_movement.pharmacy_id
      and medicine_id = v_movement.medicine_id;

    if not found then
      raise exception 'Could not restore reserved inventory for this order';
    end if;

    if v_movement.batch_id is not null then
      update public.medicine_batches
      set quantity_remaining = quantity_remaining + abs(v_movement.quantity_change)
      where id = v_movement.batch_id;
    end if;

    insert into public.stock_movements (
      pharmacy_id, medicine_id, batch_id, movement_type, quantity_change,
      unit_cost, unit_selling_price, reference_type, reference_id, created_by, note
    )
    values (
      v_movement.pharmacy_id, v_movement.medicine_id, v_movement.batch_id,
      'order_cancelled', abs(v_movement.quantity_change),
      v_movement.unit_cost, v_movement.unit_selling_price, 'order', p_order_id,
      auth.uid(), p_note
    );
  end loop;
end;
$$;

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
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one medicine';
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
    if v_qty <= 0 then
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
      v_owner, p_pharmacy_id, v_order_id, 'new_order', 'New order received',
      'A customer has requested medicines. Review availability and prepare a final quote.'
    );
  end if;

  return v_order_id;
end;
$$;

create or replace function public.pharmacy_quote_order(
  p_order_id uuid,
  p_final_total numeric,
  p_discount numeric default 0,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_batch record;
  v_owner uuid;
  v_remaining integer;
  v_batch_deduction integer;
  v_batch_available integer;
  v_has_batches boolean;
begin
  if p_final_total is null or p_discount is null or p_final_total < 0 or p_discount < 0 then
    raise exception 'Price and discount are required and cannot be negative';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if not public.owns_pharmacy(v_order.pharmacy_id) then
    raise exception 'Only the pharmacy owner can send a quote';
  end if;
  if not exists (
    select 1 from public.pharmacies p
    where p.id = v_order.pharmacy_id
      and p.is_active
      and p.verification_status = 'approved'
  ) then
    raise exception 'Only an active, approved pharmacy can quote an order';
  end if;
  if v_order.status <> 'pending' or v_order.quote_sent_at is not null then
    raise exception 'This order is no longer waiting for a pharmacy quote';
  end if;
  if p_discount <> round(p_discount, 2)
    or p_final_total <> round(p_final_total, 2)
    or p_discount > v_order.subtotal
    or round(p_final_total, 2) <> round(v_order.subtotal - p_discount, 2) then
    raise exception 'Final total must equal the indicative subtotal minus the discount';
  end if;

  for v_item in
    select oi.*
    from public.order_items oi
    where oi.order_id = p_order_id
    order by oi.medicine_id
  loop
    update public.inventory i
    set quantity_on_hand = i.quantity_on_hand - v_item.quantity,
        updated_at = now()
    where i.pharmacy_id = v_order.pharmacy_id
      and i.medicine_id = v_item.medicine_id
      and i.quantity_on_hand >= v_item.quantity;

    if not found then
      raise exception 'Stock changed; there is not enough stock to reserve this order';
    end if;

    select
      exists (
        select 1 from public.medicine_batches mb
        where mb.pharmacy_id = v_order.pharmacy_id
          and mb.medicine_id = v_item.medicine_id
          and mb.quantity_remaining > 0
      ),
      coalesce(sum(mb.quantity_remaining) filter (
        where mb.quantity_remaining > 0
          and (mb.expiry_date is null or mb.expiry_date >= current_date)
      ), 0)::integer
    into v_has_batches, v_batch_available
    from public.medicine_batches mb
    where mb.pharmacy_id = v_order.pharmacy_id
      and mb.medicine_id = v_item.medicine_id;

    if v_has_batches and v_batch_available < v_item.quantity then
      raise exception 'There is not enough non-expired batch stock to fulfill this order';
    end if;

    v_remaining := v_item.quantity;
    for v_batch in
      select mb.id, mb.quantity_remaining
      from public.medicine_batches mb
      where mb.pharmacy_id = v_order.pharmacy_id
        and mb.medicine_id = v_item.medicine_id
        and mb.quantity_remaining > 0
        and (mb.expiry_date is null or mb.expiry_date >= current_date)
      order by mb.expiry_date asc nulls last, mb.received_at asc, mb.id
      for update
    loop
      exit when v_remaining = 0;
      v_batch_deduction := least(v_remaining, v_batch.quantity_remaining);

      update public.medicine_batches
      set quantity_remaining = quantity_remaining - v_batch_deduction
      where id = v_batch.id;

      insert into public.stock_movements (
        pharmacy_id, medicine_id, batch_id, movement_type, quantity_change,
        unit_cost, unit_selling_price, reference_type, reference_id, created_by
      )
      values (
        v_order.pharmacy_id, v_item.medicine_id, v_batch.id, 'sale', -v_batch_deduction,
        v_item.unit_cost_snapshot, v_item.unit_selling_price, 'order', p_order_id, auth.uid()
      );
      v_remaining := v_remaining - v_batch_deduction;
    end loop;

    if v_remaining > 0 then
      insert into public.stock_movements (
        pharmacy_id, medicine_id, movement_type, quantity_change,
        unit_cost, unit_selling_price, reference_type, reference_id, created_by
      )
      values (
        v_order.pharmacy_id, v_item.medicine_id, 'sale', -v_remaining,
        v_item.unit_cost_snapshot, v_item.unit_selling_price, 'order', p_order_id, auth.uid()
      );
    end if;
  end loop;

  update public.orders
  set quoted_subtotal = subtotal,
      discount_amount = p_discount,
      final_total = p_final_total,
      quote_message = nullif(trim(p_message), ''),
      quote_sent_at = now(),
      customer_accepted_quote_at = null,
      updated_at = now()
  where id = p_order_id;

  select p.owner_user_id into v_owner
  from public.pharmacies p
  where p.id = v_order.pharmacy_id;

  if v_order.customer_user_id is not null then
    insert into public.notifications(recipient_user_id, pharmacy_id, order_id, kind, title, message)
    values (
      v_order.customer_user_id, v_order.pharmacy_id, p_order_id,
      'price_quote', 'Pharmacy sent your final price',
      'Your order ' || coalesce(v_order.order_number, p_order_id::text)
        || ' has a final price of ₹' || p_final_total::text
        || '. Review the quote in your order history.'
    );
  end if;

  if v_owner is not null then
    insert into public.notifications(recipient_user_id, pharmacy_id, order_id, kind, title, message)
    values (
      v_owner, v_order.pharmacy_id, p_order_id,
      'quote_sent', 'Price quote sent', 'The customer must accept or decline before fulfillment can start.'
    );
  end if;
end;
$$;

create or replace function public.customer_respond_to_pharmacy_quote(
  p_order_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to an order quote';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.customer_user_id is distinct from auth.uid() then
    raise exception 'Only the customer who placed this order can respond';
  end if;
  if v_order.status <> 'pending'
    or v_order.quote_sent_at is null
    or v_order.customer_accepted_quote_at is not null then
    raise exception 'This order does not have an unanswered quote';
  end if;

  select p.owner_user_id into v_owner
  from public.pharmacies p
  where p.id = v_order.pharmacy_id;

  if p_accept then
    update public.orders
    set status = 'confirmed',
        customer_accepted_quote_at = now(),
        updated_at = now()
    where id = p_order_id;

    if v_owner is not null then
      insert into public.notifications(recipient_user_id, pharmacy_id, order_id, kind, title, message)
      values (
        v_owner, v_order.pharmacy_id, p_order_id,
        'quote_accepted', 'Customer accepted your quote',
        'Order ' || coalesce(v_order.order_number, p_order_id::text) || ' is ready to prepare.'
      );
    end if;
    return;
  end if;

  perform public.restore_pharmacy_order_stock(p_order_id, 'Customer declined pharmacy quote');

  update public.orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_order_id;

  if v_owner is not null then
    insert into public.notifications(recipient_user_id, pharmacy_id, order_id, kind, title, message)
    values (
      v_owner, v_order.pharmacy_id, p_order_id,
      'quote_declined', 'Customer declined your quote',
      'Reserved stock for order ' || coalesce(v_order.order_number, p_order_id::text) || ' has been returned to inventory.'
    );
  end if;
end;
$$;

create or replace function public.record_pharmacy_manual_sale(
  p_pharmacy_id uuid,
  p_medicine_id uuid,
  p_quantity integer,
  p_unit_selling_price numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_available integer;
  v_unit_cost numeric(12,2);
  v_selling_price numeric(12,2);
  v_remaining integer;
  v_batch record;
  v_batch_deduction integer;
  v_batch_available integer;
  v_has_batches boolean;
begin
  perform public.assert_pharmacy_inventory_access(p_pharmacy_id);

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Sale quantity must be greater than zero';
  end if;
  if p_medicine_id is null then
    raise exception 'Select a medicine';
  end if;

  select i.quantity_on_hand, i.average_purchase_cost, i.selling_price
  into v_available, v_unit_cost, v_selling_price
  from public.inventory i
  where i.pharmacy_id = p_pharmacy_id and i.medicine_id = p_medicine_id
  for update;

  if not found then
    raise exception 'This medicine is not in the pharmacy inventory';
  end if;
  if v_available < p_quantity then
    raise exception 'Only % units are currently available', v_available;
  end if;

  v_selling_price := coalesce(p_unit_selling_price, v_selling_price);
  if v_selling_price < 0 then
    raise exception 'Selling price cannot be negative';
  end if;

  select
    exists (
      select 1 from public.medicine_batches mb
      where mb.pharmacy_id = p_pharmacy_id
        and mb.medicine_id = p_medicine_id
        and mb.quantity_remaining > 0
    ),
    coalesce(sum(mb.quantity_remaining) filter (
      where mb.quantity_remaining > 0
        and (mb.expiry_date is null or mb.expiry_date >= current_date)
    ), 0)::integer
  into v_has_batches, v_batch_available
  from public.medicine_batches mb
  where mb.pharmacy_id = p_pharmacy_id
    and mb.medicine_id = p_medicine_id;

  if v_has_batches and v_batch_available < p_quantity then
    raise exception 'There is not enough non-expired batch stock for this sale';
  end if;

  update public.inventory
  set quantity_on_hand = quantity_on_hand - p_quantity,
      updated_at = now()
  where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id;

  v_remaining := p_quantity;
  for v_batch in
    select mb.id, mb.quantity_remaining
    from public.medicine_batches mb
    where mb.pharmacy_id = p_pharmacy_id
      and mb.medicine_id = p_medicine_id
      and mb.quantity_remaining > 0
      and (mb.expiry_date is null or mb.expiry_date >= current_date)
    order by mb.expiry_date asc nulls last, mb.received_at asc, mb.id
    for update
  loop
    exit when v_remaining = 0;
    v_batch_deduction := least(v_remaining, v_batch.quantity_remaining);
    update public.medicine_batches
    set quantity_remaining = quantity_remaining - v_batch_deduction
    where id = v_batch.id;
    v_remaining := v_remaining - v_batch_deduction;
  end loop;

  insert into public.stock_movements (
    pharmacy_id, medicine_id, movement_type, quantity_change,
    unit_cost, unit_selling_price, reference_type, note, created_by
  )
  values (
    p_pharmacy_id, p_medicine_id, 'sale', -p_quantity,
    v_unit_cost, v_selling_price, 'manual_sale', nullif(trim(p_note), ''), auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

create or replace function public.pharmacy_update_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_owner uuid;
  v_had_reservation boolean := false;
begin
  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  if not public.owns_pharmacy(v_order.pharmacy_id) then
    raise exception 'Only the pharmacy owner can update this order';
  end if;
  if p_status not in ('processing', 'ready', 'completed', 'cancelled') then
    raise exception 'Unsupported pharmacy order action';
  end if;

  if p_status = 'cancelled' then
    if v_order.status in ('completed', 'cancelled') then
      raise exception 'Completed or cancelled orders cannot be cancelled again';
    end if;
    if v_order.status in ('processing', 'ready') then
      raise exception 'An order cannot be cancelled after fulfillment has started';
    end if;

    v_had_reservation := v_order.quote_sent_at is not null;
    if v_had_reservation then
      perform public.restore_pharmacy_order_stock(p_order_id, 'Pharmacy cancelled order');
    end if;

    update public.orders
    set status = 'cancelled', updated_at = now()
    where id = p_order_id;
  else
    if v_order.customer_accepted_quote_at is null then
      raise exception 'The customer must accept the final price before fulfillment';
    end if;
    if (v_order.status = 'confirmed' and p_status <> 'processing')
      or (v_order.status = 'processing' and p_status not in ('ready', 'completed'))
      or (v_order.status = 'ready' and p_status <> 'completed') then
      raise exception 'Order status transition is not allowed';
    end if;

    update public.orders
    set status = p_status,
        completed_at = case when p_status = 'completed' then now() else completed_at end,
        updated_at = now()
    where id = p_order_id;
  end if;

  select p.owner_user_id into v_owner
  from public.pharmacies p
  where p.id = v_order.pharmacy_id;

  if v_order.customer_user_id is not null then
    insert into public.notifications(recipient_user_id, pharmacy_id, order_id, kind, title, message)
    values (
      v_order.customer_user_id, v_order.pharmacy_id, p_order_id,
      case when p_status = 'cancelled' then 'order_cancelled' else 'order_status' end,
      case when p_status = 'cancelled' then 'Order cancelled' else 'Order updated' end,
      'Your order ' || coalesce(v_order.order_number, p_order_id::text)
        || case when p_status = 'cancelled' and v_had_reservation then ' was cancelled and reserved stock was restored.'
                when p_status = 'cancelled' then ' was cancelled.'
                else ' is now ' || p_status::text || '.' end
    );
  end if;
end;
$$;

-- Older quotes were marked confirmed before the customer response step existed.
-- Re-open only unanswered quotes so those customers can accept or decline them.
update public.orders
set status = 'pending',
    updated_at = now()
where status = 'confirmed'
  and quote_sent_at is not null
  and customer_accepted_quote_at is null;

revoke all on function public.pharmacy_quote_order(uuid, numeric, numeric, text) from public;
revoke all on function public.place_pharmacy_order(uuid, text, text, text, public.fulfillment_type, jsonb) from public, anon;
revoke all on function public.customer_respond_to_pharmacy_quote(uuid, boolean) from public;
revoke all on function public.pharmacy_update_order_status(uuid, public.order_status) from public;
revoke all on function public.restore_pharmacy_order_stock(uuid, text) from public;
grant execute on function public.pharmacy_quote_order(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.place_pharmacy_order(uuid, text, text, text, public.fulfillment_type, jsonb) to authenticated;
grant execute on function public.customer_respond_to_pharmacy_quote(uuid, boolean) to authenticated;
grant execute on function public.pharmacy_update_order_status(uuid, public.order_status) to authenticated;
drop policy if exists "orders_customer_or_pharmacy_update" on public.orders;
revoke update on public.orders from anon, authenticated;

grant select on public.pharmacy_inventory_status to authenticated;
grant select on public.orders, public.order_items to authenticated;

create or replace view public.admin_inventory_status
with (security_invoker = true)
as
select
  s.pharmacy_id,
  s.pharmacy_name,
  s.state,
  s.district,
  s.city,
  p.verification_status::text as verification_status,
  s.medicine_id,
  s.medicine_name,
  s.generic_name,
  s.quantity_on_hand,
  s.reorder_level,
  s.selling_price,
  s.average_purchase_cost,
  s.is_low_stock,
  s.nearest_expiry
from public.pharmacy_inventory_status s
join public.pharmacies p on p.id = s.pharmacy_id
where public.is_admin();

create or replace view public.admin_customer_summary
with (security_invoker = true)
as
select
  coalesce(
    o.customer_user_id::text,
    nullif(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), ''),
    o.id::text
  ) as customer_key,
  max(o.customer_user_id::text) as customer_user_id,
  (array_agg(o.customer_name order by o.created_at desc))[1] as customer_name,
  (array_agg(o.customer_phone order by o.created_at desc))[1] as customer_phone,
  count(*)::bigint as orders,
  count(*) filter (where o.status = 'completed')::bigint as completed_orders,
  coalesce(sum(o.final_total) filter (where o.status = 'completed'), 0)::numeric as completed_sales,
  max(o.created_at) as last_order_at
from public.orders o
where public.is_admin()
group by coalesce(
  o.customer_user_id::text,
  nullif(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), ''),
  o.id::text
);

grant select on public.admin_inventory_status, public.admin_customer_summary to authenticated;

notify pgrst, 'reload schema';
