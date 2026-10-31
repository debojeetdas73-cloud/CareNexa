-- Extend the existing pharmacy inventory model with safe batch controls.
-- Stock receipts, adjustments, and sales remain transactionally managed through RPCs.

alter table public.medicine_batches
  add column if not exists manufacturing_date date,
  add column if not exists stock_status text not null default 'available';

do $$ begin
  alter table public.medicine_batches
    add constraint medicine_batches_stock_status_check
    check (stock_status in ('available', 'quarantined', 'recalled'));
exception when duplicate_object then null; end $$;

create or replace view public.pharmacy_inventory_status with (security_invoker = true) as
select
  i.pharmacy_id, p.name as pharmacy_name, p.state, p.district, p.city,
  i.medicine_id, m.name as medicine_name, m.generic_name,
  i.quantity_on_hand, i.reorder_level, i.selling_price, i.average_purchase_cost,
  (i.quantity_on_hand <= i.reorder_level) as is_low_stock,
  coalesce(b.nearest_expiry, null) as nearest_expiry,
  m.brand_name, m.category, m.strength, m.dosage_form, m.pack_size, m.manufacturer
from public.inventory i
join public.pharmacies p on p.id = i.pharmacy_id
join public.medicines m on m.id = i.medicine_id
left join lateral (
  select min(mb.expiry_date) as nearest_expiry
  from public.medicine_batches mb
  where mb.pharmacy_id = i.pharmacy_id and mb.medicine_id = i.medicine_id
    and mb.quantity_remaining > 0 and mb.expiry_date is not null
) b on true;

-- Inventory and purchase records are read through RLS and changed through checked RPCs.
drop policy if exists "inventory_owner_manage" on public.inventory;
drop policy if exists "inventory_owner_read" on public.inventory;
create policy "inventory_owner_read" on public.inventory for select
using (public.owns_pharmacy(pharmacy_id) or public.is_admin());

drop policy if exists "batches_owner_manage" on public.medicine_batches;
drop policy if exists "batches_owner_read" on public.medicine_batches;
create policy "batches_owner_read" on public.medicine_batches for select
using (public.owns_pharmacy(pharmacy_id) or public.is_admin());

drop policy if exists "purchases_owner_manage" on public.purchases;
drop policy if exists "purchases_owner_read" on public.purchases;
create policy "purchases_owner_read" on public.purchases for select
using (public.owns_pharmacy(pharmacy_id) or public.is_admin());

drop policy if exists "purchase_items_owner_manage" on public.purchase_items;
drop policy if exists "purchase_items_owner_read" on public.purchase_items;
create policy "purchase_items_owner_read" on public.purchase_items for select
using (
  exists (
    select 1 from public.purchases pu
    where pu.id = purchase_id and (public.owns_pharmacy(pu.pharmacy_id) or public.is_admin())
  )
);

revoke insert, update, delete on public.inventory, public.medicine_batches,
  public.purchases, public.purchase_items, public.stock_movements
  from public, anon, authenticated;
grant select on public.inventory, public.medicine_batches, public.purchases,
  public.purchase_items, public.stock_movements to authenticated;
grant select on public.pharmacy_inventory_status to authenticated;

create or replace function public.record_pharmacy_purchase(
  p_pharmacy_id uuid,
  p_medicine_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_selling_price numeric,
  p_supplier_name text default null,
  p_invoice_number text default null,
  p_batch_number text default null,
  p_expiry_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_batch_id uuid;
  v_batch_number text;
  v_current_quantity integer;
  v_current_cost numeric(12,2);
begin
  perform public.assert_pharmacy_inventory_access(p_pharmacy_id);

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Purchase quantity must be greater than zero';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 or p_selling_price is null or p_selling_price < 0 then
    raise exception 'Purchase cost and selling price cannot be negative';
  end if;
  if p_medicine_id is null or not exists (select 1 from public.medicines where id = p_medicine_id) then
    raise exception 'Select a valid medicine';
  end if;
  if p_expiry_date is not null and p_expiry_date < current_date then
    raise exception 'Cannot receive a batch that is already expired';
  end if;

  insert into public.purchases (
    pharmacy_id, supplier_name, invoice_number, total_cost, notes, created_by
  ) values (
    p_pharmacy_id, nullif(trim(p_supplier_name), ''), nullif(trim(p_invoice_number), ''),
    p_quantity * p_unit_cost, nullif(trim(p_notes), ''), auth.uid()
  ) returning id into v_purchase_id;

  insert into public.purchase_items (
    purchase_id, medicine_id, batch_number, expiry_date, quantity, unit_cost, selling_price
  ) values (
    v_purchase_id, p_medicine_id, nullif(trim(p_batch_number), ''),
    p_expiry_date, p_quantity, p_unit_cost, p_selling_price
  );

  v_batch_number := coalesce(nullif(trim(p_batch_number), ''), 'AUTO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
  insert into public.medicine_batches (
    pharmacy_id, medicine_id, batch_number, expiry_date, quantity_received,
    quantity_remaining, purchase_cost_per_unit, selling_price_per_unit, supplier_name
  ) values (
    p_pharmacy_id, p_medicine_id, v_batch_number, p_expiry_date, p_quantity,
    p_quantity, p_unit_cost, p_selling_price, nullif(trim(p_supplier_name), '')
  ) returning id into v_batch_id;

  select quantity_on_hand, average_purchase_cost
    into v_current_quantity, v_current_cost
  from public.inventory
  where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id
  for update;

  if not found then
    insert into public.inventory (
      pharmacy_id, medicine_id, quantity_on_hand, average_purchase_cost, selling_price
    ) values (
      p_pharmacy_id, p_medicine_id, p_quantity, p_unit_cost, p_selling_price
    );
  else
    update public.inventory
    set quantity_on_hand = v_current_quantity + p_quantity,
        average_purchase_cost = case
          when v_current_quantity + p_quantity = 0 then p_unit_cost
          else ((v_current_quantity * v_current_cost) + (p_quantity * p_unit_cost)) / (v_current_quantity + p_quantity)
        end,
        selling_price = p_selling_price,
        updated_at = now()
    where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id;
  end if;

  insert into public.stock_movements (
    pharmacy_id, medicine_id, batch_id, movement_type, quantity_change,
    unit_cost, unit_selling_price, reference_type, reference_id, note, created_by
  ) values (
    p_pharmacy_id, p_medicine_id, v_batch_id, 'purchase', p_quantity,
    p_unit_cost, p_selling_price, 'purchase', v_purchase_id,
    nullif(trim(p_notes), ''), auth.uid()
  );

  return v_purchase_id;
end;
$$;

-- Backward-compatible overload that records the optional manufacture date in the same transaction.
create or replace function public.record_pharmacy_purchase(
  p_pharmacy_id uuid,
  p_medicine_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_selling_price numeric,
  p_supplier_name text,
  p_invoice_number text,
  p_batch_number text,
  p_expiry_date date,
  p_notes text,
  p_manufacturing_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_id uuid;
  v_batch_id uuid;
begin
  if p_manufacturing_date is not null and p_manufacturing_date > current_date then
    raise exception 'Manufacturing date cannot be in the future';
  end if;
  if p_manufacturing_date is not null and p_expiry_date is not null
    and p_manufacturing_date > p_expiry_date then
    raise exception 'Manufacturing date cannot be after the expiry date';
  end if;

  v_purchase_id := public.record_pharmacy_purchase(
    p_pharmacy_id, p_medicine_id, p_quantity, p_unit_cost, p_selling_price,
    p_supplier_name, p_invoice_number, p_batch_number, p_expiry_date, p_notes
  );

  if p_manufacturing_date is not null then
    select sm.batch_id into v_batch_id
    from public.stock_movements sm
    where sm.pharmacy_id = p_pharmacy_id
      and sm.reference_type = 'purchase'
      and sm.reference_id = v_purchase_id
      and sm.movement_type = 'purchase'
    order by sm.created_at desc
    limit 1;
    if v_batch_id is null then
      raise exception 'Received batch could not be located for its manufacturing date';
    end if;
    update public.medicine_batches
    set manufacturing_date = p_manufacturing_date
    where id = v_batch_id and pharmacy_id = p_pharmacy_id;
  end if;
  return v_purchase_id;
end;
$$;

create or replace function public.update_pharmacy_inventory_settings(
  p_pharmacy_id uuid,
  p_medicine_id uuid,
  p_reorder_level integer,
  p_selling_price numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_pharmacy_inventory_access(p_pharmacy_id);
  if p_reorder_level is null or p_reorder_level < 0 then
    raise exception 'Reorder level cannot be negative';
  end if;
  if p_selling_price is null or p_selling_price < 0 then
    raise exception 'Selling price cannot be negative';
  end if;

  update public.inventory
  set reorder_level = p_reorder_level,
      selling_price = p_selling_price,
      updated_at = pg_catalog.now()
  where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id;
  if not found then
    raise exception 'This medicine is not in the pharmacy inventory';
  end if;
end;
$$;

create or replace function public.set_pharmacy_batch_status(
  p_pharmacy_id uuid,
  p_batch_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.medicine_batches%rowtype;
begin
  perform public.assert_pharmacy_inventory_access(p_pharmacy_id);
  if p_status is null or p_status not in ('available', 'quarantined', 'recalled') then
    raise exception 'Choose available, quarantined, or recalled';
  end if;

  select * into v_batch
  from public.medicine_batches
  where id = p_batch_id and pharmacy_id = p_pharmacy_id
  for update;
  if not found then
    raise exception 'Batch was not found in this pharmacy';
  end if;
  if p_status = 'available' and v_batch.expiry_date is not null and v_batch.expiry_date < current_date then
    raise exception 'Expired batches cannot be returned to available stock';
  end if;
  if v_batch.stock_status = 'recalled' and p_status <> 'recalled' then
    raise exception 'Recalled batches cannot be released through inventory controls';
  end if;
  if v_batch.stock_status = p_status then
    raise exception 'Batch already has this status';
  end if;

  update public.medicine_batches set stock_status = p_status where id = p_batch_id;
  insert into public.stock_movements (
    pharmacy_id, medicine_id, batch_id, movement_type, quantity_change,
    reference_type, reference_id, note, created_by
  ) values (
    p_pharmacy_id, v_batch.medicine_id, p_batch_id, 'adjustment', 0,
    'batch_status', p_batch_id,
    pg_catalog.concat('Batch status: ', v_batch.stock_status, ' → ', p_status,
      case when nullif(pg_catalog.btrim(p_note), '') is null then '' else ' · ' || pg_catalog.btrim(p_note) end),
    auth.uid()
  );
end;
$$;

create or replace function public.record_pharmacy_batch_writeoff(
  p_pharmacy_id uuid,
  p_batch_id uuid,
  p_quantity integer,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_medicine_id uuid;
  v_batch public.medicine_batches%rowtype;
  v_inventory_quantity integer;
  v_movement_id uuid;
  v_movement_type text;
begin
  perform public.assert_pharmacy_inventory_access(p_pharmacy_id);
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Adjustment quantity must be greater than zero';
  end if;
  if p_reason is null or p_reason not in ('expired', 'damaged', 'recall') then
    raise exception 'Choose expired, damaged, or recall';
  end if;

  select medicine_id into v_medicine_id
  from public.medicine_batches
  where id = p_batch_id and pharmacy_id = p_pharmacy_id;
  if not found then
    raise exception 'Batch was not found in this pharmacy';
  end if;

  select quantity_on_hand into v_inventory_quantity
  from public.inventory
  where pharmacy_id = p_pharmacy_id and medicine_id = v_medicine_id
  for update;
  if not found then
    raise exception 'Inventory row was not found for this batch';
  end if;

  select * into v_batch
  from public.medicine_batches
  where id = p_batch_id and pharmacy_id = p_pharmacy_id
  for update;
  if p_quantity > v_batch.quantity_remaining or p_quantity > v_inventory_quantity then
    raise exception 'Adjustment quantity exceeds remaining batch or pharmacy stock';
  end if;
  if p_reason = 'expired' and (v_batch.expiry_date is null or v_batch.expiry_date >= current_date) then
    raise exception 'Only an expired batch can be written off as expired';
  end if;
  if p_reason = 'recall' and v_batch.stock_status <> 'recalled' then
    raise exception 'Mark the batch as recalled before writing it off';
  end if;

  update public.medicine_batches
  set quantity_remaining = quantity_remaining - p_quantity
  where id = p_batch_id;
  update public.inventory
  set quantity_on_hand = quantity_on_hand - p_quantity,
      updated_at = pg_catalog.now()
  where pharmacy_id = p_pharmacy_id and medicine_id = v_medicine_id;

  v_movement_type := case when p_reason = 'expired' then 'expired' else 'adjustment' end;
  insert into public.stock_movements (
    pharmacy_id, medicine_id, batch_id, movement_type, quantity_change,
    unit_cost, unit_selling_price, reference_type, reference_id, note, created_by
  ) values (
    p_pharmacy_id, v_medicine_id, p_batch_id, v_movement_type, -p_quantity,
    v_batch.purchase_cost_per_unit, v_batch.selling_price_per_unit,
    'batch_writeoff', p_batch_id,
    pg_catalog.concat(pg_catalog.initcap(p_reason), ' stock write-off',
      case when nullif(pg_catalog.btrim(p_note), '') is null then '' else ': ' || pg_catalog.btrim(p_note) end),
    auth.uid()
  ) returning id into v_movement_id;
  return v_movement_id;
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
  v_has_batches boolean;
begin
  perform public.assert_pharmacy_inventory_access(p_pharmacy_id);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Sale quantity must be greater than zero'; end if;
  if p_medicine_id is null then raise exception 'Select a medicine'; end if;

  select quantity_on_hand, average_purchase_cost, selling_price
    into v_available, v_unit_cost, v_selling_price
  from public.inventory
  where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id
  for update;
  if not found then raise exception 'This medicine is not in the pharmacy inventory'; end if;
  if v_available < p_quantity then raise exception 'Only % units are currently available', v_available; end if;
  v_selling_price := coalesce(p_unit_selling_price, v_selling_price);
  if v_selling_price < 0 then raise exception 'Selling price cannot be negative'; end if;

  select exists (
    select 1 from public.medicine_batches mb
    where mb.pharmacy_id = p_pharmacy_id and mb.medicine_id = p_medicine_id and mb.quantity_remaining > 0
  ) into v_has_batches;
  if v_has_batches and (
    select coalesce(sum(mb.quantity_remaining), 0)
    from public.medicine_batches mb
    where mb.pharmacy_id = p_pharmacy_id and mb.medicine_id = p_medicine_id
      and mb.quantity_remaining > 0 and mb.stock_status = 'available'
      and (mb.expiry_date is null or mb.expiry_date >= current_date)
  ) < p_quantity then
    raise exception 'There is not enough eligible, non-expired batch stock for this sale';
  end if;

  update public.inventory
  set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now()
  where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id;

  v_remaining := p_quantity;
  for v_batch in
    select id, quantity_remaining
    from public.medicine_batches
    where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id
      and quantity_remaining > 0 and stock_status = 'available'
      and (expiry_date is null or expiry_date >= current_date)
    order by expiry_date asc nulls last, received_at asc, id
    for update
  loop
    exit when v_remaining = 0;
    v_batch_deduction := least(v_remaining, v_batch.quantity_remaining);
    update public.medicine_batches set quantity_remaining = quantity_remaining - v_batch_deduction where id = v_batch.id;
    insert into public.stock_movements (
      pharmacy_id, medicine_id, batch_id, movement_type, quantity_change,
      unit_cost, unit_selling_price, reference_type, note, created_by
    ) values (
      p_pharmacy_id, p_medicine_id, v_batch.id, 'sale', -v_batch_deduction,
      v_unit_cost, v_selling_price, 'manual_sale', nullif(trim(p_note), ''), auth.uid()
    ) returning id into v_movement_id;
    v_remaining := v_remaining - v_batch_deduction;
  end loop;

  if v_remaining > 0 then
    if v_has_batches then
      raise exception 'Eligible batch stock changed while recording this sale; try again';
    end if;
    insert into public.stock_movements (
      pharmacy_id, medicine_id, movement_type, quantity_change,
      unit_cost, unit_selling_price, reference_type, note, created_by
    ) values (
      p_pharmacy_id, p_medicine_id, 'sale', -v_remaining,
      v_unit_cost, v_selling_price, 'manual_sale', nullif(trim(p_note), ''), auth.uid()
    ) returning id into v_movement_id;
  end if;
  return v_movement_id;
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

  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.owns_pharmacy(v_order.pharmacy_id) then raise exception 'Only the pharmacy owner can send a quote'; end if;
  if not exists (
    select 1 from public.pharmacies p
    where p.id = v_order.pharmacy_id and p.is_active and p.verification_status = 'approved'
  ) then raise exception 'Only an active, approved pharmacy can quote an order'; end if;
  if v_order.status <> 'pending' or v_order.quote_sent_at is not null then
    raise exception 'This order is no longer waiting for a pharmacy quote';
  end if;
  if p_discount <> round(p_discount, 2) or p_final_total <> round(p_final_total, 2)
    or p_discount > v_order.subtotal
    or round(p_final_total, 2) <> round(v_order.subtotal - p_discount, 2) then
    raise exception 'Final total must equal the indicative subtotal minus the discount';
  end if;

  for v_item in
    select oi.* from public.order_items oi where oi.order_id = p_order_id order by oi.medicine_id
  loop
    update public.inventory i
    set quantity_on_hand = i.quantity_on_hand - v_item.quantity, updated_at = now()
    where i.pharmacy_id = v_order.pharmacy_id and i.medicine_id = v_item.medicine_id
      and i.quantity_on_hand >= v_item.quantity;
    if not found then raise exception 'Stock changed; there is not enough stock to reserve this order'; end if;

    select
      exists (
        select 1 from public.medicine_batches mb
        where mb.pharmacy_id = v_order.pharmacy_id and mb.medicine_id = v_item.medicine_id
          and mb.quantity_remaining > 0
      ),
      coalesce(sum(mb.quantity_remaining) filter (
        where mb.quantity_remaining > 0 and mb.stock_status = 'available'
          and (mb.expiry_date is null or mb.expiry_date >= current_date)
      ), 0)::integer
    into v_has_batches, v_batch_available
    from public.medicine_batches mb
    where mb.pharmacy_id = v_order.pharmacy_id and mb.medicine_id = v_item.medicine_id;
    if v_has_batches and v_batch_available < v_item.quantity then
      raise exception 'There is not enough eligible, non-expired batch stock to fulfill this order';
    end if;

    v_remaining := v_item.quantity;
    for v_batch in
      select mb.id, mb.quantity_remaining
      from public.medicine_batches mb
      where mb.pharmacy_id = v_order.pharmacy_id and mb.medicine_id = v_item.medicine_id
        and mb.quantity_remaining > 0 and mb.stock_status = 'available'
        and (mb.expiry_date is null or mb.expiry_date >= current_date)
      order by mb.expiry_date asc nulls last, mb.received_at asc, mb.id
      for update
    loop
      exit when v_remaining = 0;
      v_batch_deduction := least(v_remaining, v_batch.quantity_remaining);
      update public.medicine_batches set quantity_remaining = quantity_remaining - v_batch_deduction where id = v_batch.id;
      insert into public.stock_movements (
        pharmacy_id, medicine_id, batch_id, movement_type, quantity_change,
        unit_cost, unit_selling_price, reference_type, reference_id, created_by
      ) values (
        v_order.pharmacy_id, v_item.medicine_id, v_batch.id, 'sale', -v_batch_deduction,
        v_item.unit_cost_snapshot, v_item.unit_selling_price, 'order', p_order_id, auth.uid()
      );
      v_remaining := v_remaining - v_batch_deduction;
    end loop;
    if v_remaining > 0 then
      if v_has_batches then
        raise exception 'Eligible batch stock changed while reserving this order; try again';
      end if;
      insert into public.stock_movements (
        pharmacy_id, medicine_id, movement_type, quantity_change,
        unit_cost, unit_selling_price, reference_type, reference_id, created_by
      ) values (
        v_order.pharmacy_id, v_item.medicine_id, 'sale', -v_remaining,
        v_item.unit_cost_snapshot, v_item.unit_selling_price, 'order', p_order_id, auth.uid()
      );
    end if;
  end loop;

  update public.orders
  set quoted_subtotal = subtotal, discount_amount = p_discount, final_total = p_final_total,
      quote_message = nullif(trim(p_message), ''), quote_sent_at = now(),
      customer_accepted_quote_at = null, updated_at = now()
  where id = p_order_id;

  select p.owner_user_id into v_owner from public.pharmacies p where p.id = v_order.pharmacy_id;
  if v_order.customer_user_id is not null then
    insert into public.notifications(recipient_user_id, pharmacy_id, order_id, kind, title, message)
    values (v_order.customer_user_id, v_order.pharmacy_id, p_order_id,
      'price_quote', 'Pharmacy sent your final price',
      'Your order ' || coalesce(v_order.order_number, p_order_id::text)
        || ' has a final price of ₹' || p_final_total::text || '. Review the quote in your order history.');
  end if;
  if v_owner is not null then
    insert into public.notifications(recipient_user_id, pharmacy_id, order_id, kind, title, message)
    values (v_owner, v_order.pharmacy_id, p_order_id, 'quote_sent', 'Price quote sent',
      'The customer must accept or decline before fulfillment can start.');
  end if;
end;
$$;

revoke all on function public.record_pharmacy_purchase(uuid, uuid, integer, numeric, numeric, text, text, text, date, text) from public, anon;
revoke all on function public.record_pharmacy_purchase(uuid, uuid, integer, numeric, numeric, text, text, text, date, text, date) from public, anon;
revoke all on function public.update_pharmacy_inventory_settings(uuid, uuid, integer, numeric) from public, anon;
revoke all on function public.set_pharmacy_batch_status(uuid, uuid, text, text) from public, anon;
revoke all on function public.record_pharmacy_batch_writeoff(uuid, uuid, integer, text, text) from public, anon;
revoke all on function public.record_pharmacy_manual_sale(uuid, uuid, integer, numeric, text) from public, anon;
revoke all on function public.pharmacy_quote_order(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.record_pharmacy_purchase(uuid, uuid, integer, numeric, numeric, text, text, text, date, text) to authenticated;
grant execute on function public.record_pharmacy_purchase(uuid, uuid, integer, numeric, numeric, text, text, text, date, text, date) to authenticated;
grant execute on function public.update_pharmacy_inventory_settings(uuid, uuid, integer, numeric) to authenticated;
grant execute on function public.set_pharmacy_batch_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.record_pharmacy_batch_writeoff(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.record_pharmacy_manual_sale(uuid, uuid, integer, numeric, text) to authenticated;
grant execute on function public.pharmacy_quote_order(uuid, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';
