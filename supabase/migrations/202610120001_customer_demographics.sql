-- Store customer demographics for the profile and admin blood group directory.
alter table public.profiles
  add column if not exists age smallint,
  add column if not exists blood_group text,
  add column if not exists city text,
  add column if not exists district text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_age_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_age_valid check (age is null or age between 1 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_blood_group_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_blood_group_valid
      check (blood_group is null or blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
  end if;
end;
$$;

create index if not exists idx_profiles_customer_blood_group
  on public.profiles (blood_group, full_name)
  where role = 'customer';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_age_text text := nullif(new.raw_user_meta_data->>'age', '');
  v_age smallint;
  v_blood_group text := nullif(new.raw_user_meta_data->>'blood_group', '');
begin
  if v_age_text is not null then
    if v_age_text !~ '^[0-9]{1,3}$' then
      raise exception 'Age must be a whole number between 1 and 120';
    end if;
    v_age := v_age_text::smallint;
    if v_age not between 1 and 120 then
      raise exception 'Age must be a whole number between 1 and 120';
    end if;
  end if;

  if v_blood_group is not null
     and v_blood_group not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    raise exception 'Select a valid blood group';
  end if;

  insert into public.profiles (id, full_name, phone, role, age, blood_group, city, district)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    'customer',
    v_age,
    v_blood_group,
    nullif(trim(new.raw_user_meta_data->>'city'), ''),
    nullif(trim(new.raw_user_meta_data->>'district'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
