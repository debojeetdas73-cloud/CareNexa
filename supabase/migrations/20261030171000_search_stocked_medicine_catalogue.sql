-- Return a wider, stock-first catalogue search. Equivalent catalogue rows are
-- grouped while preserving their real medicines.id values for stock lookup.
create or replace function public.search_customer_medicine_catalogue(p_query text)
returns table (
  id uuid,
  matching_medicine_ids uuid[],
  name text,
  generic_name text,
  brand_name text,
  category text,
  strength text,
  dosage_form text,
  pack_size text,
  manufacturer text,
  prescription_required boolean,
  has_stock boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g');
  v_pattern text;
begin
  if char_length(v_query) < 2 then
    return;
  end if;

  v_pattern := '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  return query
  with medicine_matches as (
    select
      m.id,
      m.name,
      m.generic_name,
      m.brand_name,
      m.category,
      m.strength,
      m.dosage_form,
      m.pack_size,
      m.manufacturer,
      m.prescription_required,
      exists (
        select 1
        from public.inventory i
        join public.pharmacies p on p.id = i.pharmacy_id
        where i.medicine_id = m.id
          and i.quantity_on_hand > 0
          and p.is_active
          and p.verification_status = 'approved'
      ) as has_stock
    from public.medicines m
    where concat_ws(' ', m.name, m.generic_name, m.brand_name, m.category,
      m.strength, m.dosage_form, m.pack_size, m.manufacturer) ilike v_pattern escape E'\\'
  ), identity_groups as (
    select
      (array_agg(mm.id order by mm.has_stock desc, mm.id))[1] as id,
      array_agg(mm.id order by mm.has_stock desc, mm.id) as matching_medicine_ids,
      (array_agg(mm.name order by mm.has_stock desc, mm.id))[1] as name,
      (array_agg(mm.generic_name order by mm.has_stock desc, mm.id))[1] as generic_name,
      (array_agg(mm.brand_name order by mm.has_stock desc, mm.id))[1] as brand_name,
      (array_agg(mm.category order by mm.has_stock desc, mm.id))[1] as category,
      (array_agg(mm.strength order by mm.has_stock desc, mm.id))[1] as strength,
      (array_agg(mm.dosage_form order by mm.has_stock desc, mm.id))[1] as dosage_form,
      (array_agg(mm.pack_size order by mm.has_stock desc, mm.id))[1] as pack_size,
      (array_agg(mm.manufacturer order by mm.has_stock desc, mm.id))[1] as manufacturer,
      mm.prescription_required,
      bool_or(mm.has_stock) as has_stock
    from medicine_matches mm
    group by
      regexp_replace(lower(trim(mm.name)), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(mm.generic_name, ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(mm.brand_name, ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(mm.category, ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(mm.strength, ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(mm.dosage_form, ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(mm.pack_size, ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(mm.manufacturer, ''))), '\s+', ' ', 'g'),
      mm.prescription_required
  )
  select
    ig.id,
    ig.matching_medicine_ids,
    ig.name,
    ig.generic_name,
    ig.brand_name,
    ig.category,
    ig.strength,
    ig.dosage_form,
    ig.pack_size,
    ig.manufacturer,
    ig.prescription_required,
    ig.has_stock
  from identity_groups ig
  order by ig.has_stock desc,
    case
      when lower(ig.name) = lower(v_query) then 0
      when lower(ig.name) like lower(v_query) || '%' then 1
      else 2
    end,
    ig.name,
    ig.strength nulls last,
    ig.dosage_form nulls last
  limit 50;
end;
$$;

revoke all on function public.search_customer_medicine_catalogue(text) from public, anon, authenticated;
grant execute on function public.search_customer_medicine_catalogue(text) to anon, authenticated;

create or replace function public.get_customer_medicine_stock_for_medicines(p_medicine_ids uuid[])
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
  quantity_on_hand integer
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
  if p_medicine_ids is null or cardinality(p_medicine_ids) = 0 then
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
    i.quantity_on_hand
  from public.inventory i
  join public.pharmacies p on p.id = i.pharmacy_id
  join public.medicines m on m.id = i.medicine_id
  where i.medicine_id = any(p_medicine_ids)
    and i.quantity_on_hand > 0
    and p.is_active
    and p.verification_status = 'approved'
  order by p.name, m.name;
end;
$$;

revoke all on function public.get_customer_medicine_stock_for_medicines(uuid[]) from public, anon, authenticated;
grant execute on function public.get_customer_medicine_stock_for_medicines(uuid[]) to authenticated;
