-- Let an approved pharmacy owner control the existing marketplace availability flag.
-- Verification and review fields remain administrator controlled.
create or replace function public.prevent_owner_verification_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.owner_user_id and not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_note is distinct from old.verification_note then
      raise exception 'Only an administrator can change pharmacy verification status';
    end if;

    if new.is_active and old.verification_status is distinct from 'approved' then
      raise exception 'Only an approved pharmacy can go on duty';
    end if;
  end if;

  return new;
end;
$$;
