-- Apply after the pharmacy onboarding/geolocation migrations.
-- Inventory mutations are transactional and restricted to the owning,
-- administrator-approved pharmacy.

create or replace function public.assert_pharmacy_inventory_access(p_pharmacy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before changing pharmacy inventory';
  end if;

  if not exists (
    select 1
    from public.pharmacies p
    where p.id = p_pharmacy_id
      and p.owner_user_id = auth.uid()
      and p.is_active
      and p.verification_status = 'approved'
  ) and not public.is_admin() then
    raise exception 'Only the verified pharmacy owner or an administrator can change this inventory';
  end if;
end;
$$;

revoke all on function public.assert_pharmacy_inventory_access(uuid) from public;

create or replace function public.add_pharmacy_medicine(
  p_pharmacy_id uuid,
  p_name text,
  p_generic_name text default null,
  p_brand_name text default null,
  p_category text default null,
  p_strength text default null,
  p_dosage_form text default null,
  p_pack_size text default null,
  p_reorder_level integer default 10,
  p_selling_price numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_medicine_id uuid;
begin
  perform public.assert_pharmacy_inventory_access(p_pharmacy_id);

  if nullif(trim(p_name), '') is null then
    raise exception 'Medicine name is required';
  end if;
  if coalesce(p_reorder_level, -1) < 0 then
    raise exception 'Reorder level cannot be negative';
  end if;
  if coalesce(p_selling_price, -1) < 0 then
    raise exception 'Selling price cannot be negative';
  end if;

  perform pg_advisory_xact_lock(hashtext(lower(trim(p_name))));
  select m.id into v_medicine_id
  from public.medicines m
  where lower(m.name) = lower(trim(p_name))
    and m.strength is not distinct from nullif(trim(p_strength), '')
    and m.dosage_form is not distinct from nullif(trim(p_dosage_form), '')
    and m.pack_size is not distinct from nullif(trim(p_pack_size), '')
  limit 1;

  if v_medicine_id is null then
    insert into public.medicines (
      name, generic_name, brand_name, category, strength, dosage_form, pack_size
    ) values (
      trim(p_name), nullif(trim(p_generic_name), ''), nullif(trim(p_brand_name), ''),
      nullif(trim(p_category), ''), nullif(trim(p_strength), ''),
      nullif(trim(p_dosage_form), ''), nullif(trim(p_pack_size), '')
    )
    returning id into v_medicine_id;
  end if;

  insert into public.inventory (
    pharmacy_id, medicine_id, quantity_on_hand, reorder_level, selling_price
  ) values (
    p_pharmacy_id, v_medicine_id, 0, p_reorder_level, p_selling_price
  )
  on conflict (pharmacy_id, medicine_id) do update
  set reorder_level = excluded.reorder_level,
      selling_price = excluded.selling_price,
      updated_at = now();

  return v_medicine_id;
end;
$$;

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
  if not exists (select 1 from public.medicines where id = p_medicine_id) then
    raise exception 'Select a valid medicine';
  end if;

  insert into public.purchases (
    pharmacy_id, supplier_name, invoice_number, total_cost, notes, created_by
  ) values (
    p_pharmacy_id, nullif(trim(p_supplier_name), ''), nullif(trim(p_invoice_number), ''),
    p_quantity * p_unit_cost, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_purchase_id;

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
  )
  returning id into v_batch_id;

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
begin
  perform public.assert_pharmacy_inventory_access(p_pharmacy_id);

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Sale quantity must be greater than zero';
  end if;
  if p_medicine_id is null then
    raise exception 'Select a medicine';
  end if;

  select quantity_on_hand, average_purchase_cost, selling_price
    into v_available, v_unit_cost, v_selling_price
  from public.inventory
  where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id
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

  update public.inventory
  set quantity_on_hand = quantity_on_hand - p_quantity,
      updated_at = now()
  where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id;

  v_remaining := p_quantity;
  for v_batch in
    select id, quantity_remaining
    from public.medicine_batches
    where pharmacy_id = p_pharmacy_id
      and medicine_id = p_medicine_id
      and quantity_remaining > 0
    order by expiry_date asc nulls last, received_at asc, id
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
  ) values (
    p_pharmacy_id, p_medicine_id, 'sale', -p_quantity,
    v_unit_cost, v_selling_price, 'manual_sale', nullif(trim(p_note), ''), auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

revoke all on function public.add_pharmacy_medicine(uuid, text, text, text, text, text, text, text, integer, numeric) from public;
revoke all on function public.record_pharmacy_purchase(uuid, uuid, integer, numeric, numeric, text, text, text, date, text) from public;
revoke all on function public.record_pharmacy_manual_sale(uuid, uuid, integer, numeric, text) from public;

grant execute on function public.add_pharmacy_medicine(uuid, text, text, text, text, text, text, text, integer, numeric) to authenticated;
grant execute on function public.record_pharmacy_purchase(uuid, uuid, integer, numeric, numeric, text, text, text, date, text) to authenticated;
grant execute on function public.record_pharmacy_manual_sale(uuid, uuid, integer, numeric, text) to authenticated;

notify pgrst, 'reload schema';
