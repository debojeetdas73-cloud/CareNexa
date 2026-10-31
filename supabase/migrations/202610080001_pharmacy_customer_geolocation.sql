-- Apply after 202610070001_pharmacy_onboarding.sql.
-- Add GPS coordinates to pharmacy registration. Customer coordinates are used
-- only in the browser to calculate distances and are not written to the database.

alter table public.pharmacies
  add column if not exists latitude_accuracy_m numeric;

drop function if exists public.register_pharmacy(
  text, text, text, text, text, text, text, text, time, time, boolean
);

create function public.register_pharmacy(
  p_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_state text,
  p_district text,
  p_city text,
  p_pincode text default null,
  p_opening_time time default null,
  p_closing_time time default null,
  p_is_24_hours boolean default false,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_latitude_accuracy_m numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pharmacy_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before submitting pharmacy details';
  end if;

  if coalesce(auth.jwt()->'user_metadata'->>'requested_role', '') <> 'pharmacy_owner'
     and not public.is_admin() then
    raise exception 'Choose pharmacy owner during account signup before registering a pharmacy';
  end if;

  if nullif(trim(p_name), '') is null
     or nullif(trim(p_phone), '') is null
     or nullif(trim(p_address), '') is null
     or nullif(trim(p_state), '') is null
     or nullif(trim(p_district), '') is null
     or nullif(trim(p_city), '') is null then
    raise exception 'Pharmacy name, phone, address, city, district and state are required';
  end if;

  if not coalesce(p_is_24_hours, false)
     and (p_opening_time is null or p_closing_time is null) then
    raise exception 'Provide opening and closing times, or select open 24 hours';
  end if;

  if p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'A valid GPS location is required';
  end if;

  if p_latitude_accuracy_m is not null and p_latitude_accuracy_m < 0 then
    raise exception 'GPS accuracy must be zero or greater';
  end if;

  if exists (
    select 1 from public.pharmacies
    where owner_user_id = v_user_id
  ) then
    raise exception 'A pharmacy profile is already linked to this account';
  end if;

  insert into public.pharmacies (
    owner_user_id, name, phone, email, address, state, district, city, pincode,
    opening_time, closing_time, is_24_hours, is_active, verification_status,
    latitude, longitude, latitude_accuracy_m
  ) values (
    v_user_id, trim(p_name), trim(p_phone), nullif(trim(p_email), ''),
    trim(p_address), trim(p_state), trim(p_district), trim(p_city),
    nullif(trim(p_pincode), ''),
    case when coalesce(p_is_24_hours, false) then null else p_opening_time end,
    case when coalesce(p_is_24_hours, false) then null else p_closing_time end,
    coalesce(p_is_24_hours, false), false, 'pending',
    p_latitude, p_longitude, p_latitude_accuracy_m
  )
  returning id into v_pharmacy_id;

  return v_pharmacy_id;
end;
$$;

revoke all on function public.register_pharmacy(
  text, text, text, text, text, text, text, text, time, time, boolean,
  double precision, double precision, numeric
) from public;
grant execute on function public.register_pharmacy(
  text, text, text, text, text, text, text, text, time, time, boolean,
  double precision, double precision, numeric
) to authenticated;

notify pgrst, 'reload schema';
