-- Search the live inventory for any selected catalogue medicine. Prescription
-- medicines can be discovered here, while place_pharmacy_order still rejects
-- them and routes customers through the existing prescription review flow.
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
  order by i.selling_price, p.name
  limit 100;
end;
$$;

revoke all on function public.get_customer_medicine_stock(uuid) from public, anon, authenticated;
grant execute on function public.get_customer_medicine_stock(uuid) to authenticated;
