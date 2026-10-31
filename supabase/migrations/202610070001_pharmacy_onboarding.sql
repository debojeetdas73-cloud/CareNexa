-- Apply after the initial pharmacy schema and marketplace workflow migrations.
-- Pharmacy owners may submit a registration, but cannot approve or activate it.

create or replace function public.register_pharmacy(
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
  p_is_24_hours boolean default false
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

  if exists (
    select 1 from public.pharmacies
    where owner_user_id = v_user_id
  ) then
    raise exception 'A pharmacy profile is already linked to this account';
  end if;

  insert into public.pharmacies (
    owner_user_id, name, phone, email, address, state, district, city, pincode,
    opening_time, closing_time, is_24_hours, is_active, verification_status
  ) values (
    v_user_id, trim(p_name), trim(p_phone), nullif(trim(p_email), ''),
    trim(p_address), trim(p_state), trim(p_district), trim(p_city),
    nullif(trim(p_pincode), ''),
    case when coalesce(p_is_24_hours, false) then null else p_opening_time end,
    case when coalesce(p_is_24_hours, false) then null else p_closing_time end,
    coalesce(p_is_24_hours, false), false, 'pending'
  )
  returning id into v_pharmacy_id;

  return v_pharmacy_id;
end;
$$;

revoke all on function public.register_pharmacy(text, text, text, text, text, text, text, text, time, time, boolean) from public;
grant execute on function public.register_pharmacy(text, text, text, text, text, text, text, text, time, time, boolean) to authenticated;

create or replace function public.prevent_owner_verification_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.owner_user_id and not public.is_admin() then
    if new.is_active is distinct from old.is_active
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_note is distinct from old.verification_note then
      raise exception 'Only an administrator can change pharmacy verification status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_owner_verification_changes on public.pharmacies;
create trigger prevent_owner_verification_changes
before update on public.pharmacies
for each row execute function public.prevent_owner_verification_changes();
