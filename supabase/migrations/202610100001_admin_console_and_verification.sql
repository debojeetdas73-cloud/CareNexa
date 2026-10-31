-- Apply after 202610090001_pharmacy_inventory_operations.sql.
-- Adds the reporting queries used by AdminDashboard and a private document
-- review workflow for pharmacy verification.

create or replace view public.admin_pharmacy_performance
with (security_invoker = true)
as
with completed_order_totals as (
  select
    o.pharmacy_id,
    count(distinct o.id)::bigint as orders,
    coalesce(sum(oi.quantity), 0)::bigint as units_sold,
    coalesce(sum(oi.line_total), 0)::numeric as sales_revenue,
    coalesce(sum(oi.line_total - oi.quantity * oi.unit_cost_snapshot), 0)::numeric as gross_profit
  from public.orders o
  left join public.order_items oi on oi.order_id = o.id
  where o.status = 'completed'
  group by o.pharmacy_id
)
select
  p.id as pharmacy_id,
  p.name as pharmacy_name,
  p.state,
  p.district,
  p.city,
  p.verification_status::text as verification_status,
  p.is_active,
  coalesce(t.orders, 0)::bigint as orders,
  coalesce(t.units_sold, 0)::bigint as units_sold,
  coalesce(t.sales_revenue, 0)::numeric as sales_revenue,
  coalesce(t.gross_profit, 0)::numeric as gross_profit
from public.pharmacies p
left join completed_order_totals t on t.pharmacy_id = p.id
where public.is_admin();

create or replace view public.admin_daily_sales
with (security_invoker = true)
as
select
  coalesce(o.completed_at, o.updated_at, o.created_at)::date as day,
  count(distinct o.id)::bigint as orders,
  coalesce(sum(oi.quantity), 0)::bigint as units_sold,
  coalesce(sum(oi.line_total), 0)::numeric as sales_revenue,
  coalesce(sum(oi.line_total - oi.quantity * oi.unit_cost_snapshot), 0)::numeric as gross_profit
from public.orders o
left join public.order_items oi on oi.order_id = o.id
where o.status = 'completed'
  and public.is_admin()
group by coalesce(o.completed_at, o.updated_at, o.created_at)::date;

grant select on public.admin_pharmacy_performance, public.admin_daily_sales to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant select, insert on public.pharmacy_verification_documents to authenticated;

create or replace function public.admin_revenue_series(
  p_state text default null,
  p_district text default null,
  p_city text default null,
  p_pharmacy uuid default null,
  p_days integer default 30
)
returns table (
  day date,
  orders bigint,
  units_sold bigint,
  sales_revenue numeric,
  gross_profit numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  with bounds as (
    select greatest(1, least(coalesce(p_days, 30), 365)) as day_count
  ),
  days as (
    select generate_series(current_date - (b.day_count - 1), current_date, interval '1 day')::date as sale_day
    from bounds b
  ),
  order_totals as (
    select
      o.id,
      o.pharmacy_id,
      coalesce(o.completed_at, o.updated_at, o.created_at)::date as sale_day,
      coalesce(sum(oi.quantity), 0)::bigint as units_sold,
      coalesce(sum(oi.line_total), 0)::numeric as sales_revenue,
      coalesce(sum(oi.line_total - oi.quantity * oi.unit_cost_snapshot), 0)::numeric as gross_profit
    from public.orders o
    join public.pharmacies p on p.id = o.pharmacy_id
    left join public.order_items oi on oi.order_id = o.id
    where o.status = 'completed'
      and coalesce(o.completed_at, o.updated_at, o.created_at) >= current_date - (select day_count - 1 from bounds)
      and (p_state is null or p.state = p_state)
      and (p_district is null or p.district = p_district)
      and (p_city is null or p.city = p_city)
      and (p_pharmacy is null or p.id = p_pharmacy)
    group by o.id, o.pharmacy_id, coalesce(o.completed_at, o.updated_at, o.created_at)::date
  ),
  daily_totals as (
    select
      ot.sale_day,
      count(ot.id)::bigint as orders,
      coalesce(sum(ot.units_sold), 0)::bigint as units_sold,
      coalesce(sum(ot.sales_revenue), 0)::numeric as sales_revenue,
      coalesce(sum(ot.gross_profit), 0)::numeric as gross_profit
    from order_totals ot
    group by ot.sale_day
  )
  select
    days.sale_day,
    coalesce(daily_totals.orders, 0)::bigint,
    coalesce(daily_totals.units_sold, 0)::bigint,
    coalesce(daily_totals.sales_revenue, 0)::numeric,
    coalesce(daily_totals.gross_profit, 0)::numeric
  from days
  left join daily_totals on daily_totals.sale_day = days.sale_day
  order by days.sale_day;
end;
$$;

create or replace function public.admin_top_medicines(
  p_state text default null,
  p_district text default null,
  p_city text default null,
  p_pharmacy uuid default null,
  p_limit integer default 6
)
returns table (
  medicine_name text,
  units_sold bigint,
  sales_revenue numeric,
  gross_profit numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    m.name::text,
    coalesce(sum(oi.quantity), 0)::bigint,
    coalesce(sum(oi.line_total), 0)::numeric,
    coalesce(sum(oi.line_total - oi.quantity * oi.unit_cost_snapshot), 0)::numeric
  from public.order_items oi
  join public.orders o on o.id = oi.order_id and o.status = 'completed'
  join public.pharmacies p on p.id = o.pharmacy_id
  join public.medicines m on m.id = oi.medicine_id
  where (p_state is null or p.state = p_state)
    and (p_district is null or p.district = p_district)
    and (p_city is null or p.city = p_city)
    and (p_pharmacy is null or p.id = p_pharmacy)
  group by m.id, m.name
  order by sum(oi.line_total) desc, m.name
  limit greatest(1, least(coalesce(p_limit, 6), 100));
end;
$$;

revoke all on function public.admin_revenue_series(text, text, text, uuid, integer) from public;
revoke all on function public.admin_top_medicines(text, text, text, uuid, integer) from public;
grant execute on function public.admin_revenue_series(text, text, text, uuid, integer) to authenticated;
grant execute on function public.admin_top_medicines(text, text, text, uuid, integer) to authenticated;

create or replace function public.admin_review_pharmacy_document(
  p_document_id uuid,
  p_status public.pharmacy_verification_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'A document can only be approved or rejected';
  end if;

  update public.pharmacy_verification_documents
  set review_status = p_status,
      reviewer_user_id = auth.uid(),
      reviewer_note = nullif(trim(p_note), ''),
      reviewed_at = now()
  where id = p_document_id;

  if not found then
    raise exception 'Verification document not found';
  end if;
end;
$$;

create or replace function public.admin_review_pharmacy(
  p_pharmacy_id uuid,
  p_status public.pharmacy_verification_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('pending', 'under_review', 'approved', 'rejected', 'suspended') then
    raise exception 'Invalid pharmacy review status';
  end if;

  if p_status = 'approved' and exists (
    select required.document_type
    from (values
      ('aadhaar'::text),
      ('pharmacy_license'::text),
      ('owner_photo'::text),
      ('shop_photo'::text)
    ) as required(document_type)
    where not exists (
      select 1
      from public.pharmacy_verification_documents d
      where d.pharmacy_id = p_pharmacy_id
        and d.document_type = required.document_type
        and d.review_status = 'approved'
        and not exists (
          select 1
          from public.pharmacy_verification_documents newer
          where newer.pharmacy_id = d.pharmacy_id
            and newer.document_type = d.document_type
            and (newer.created_at, newer.id) > (d.created_at, d.id)
        )
    )
  ) then
    raise exception 'Review and approve the latest version of every required document before approving this pharmacy';
  end if;

  update public.pharmacies
  set verification_status = p_status,
      is_active = (p_status = 'approved'),
      verified_at = case when p_status = 'approved' then now() else null end,
      verification_note = nullif(trim(p_note), ''),
      updated_at = now()
  where id = p_pharmacy_id;

  if not found then
    raise exception 'Pharmacy not found';
  end if;
end;
$$;

revoke all on function public.admin_review_pharmacy_document(uuid, public.pharmacy_verification_status, text) from public;
revoke all on function public.admin_review_pharmacy(uuid, public.pharmacy_verification_status, text) from public;
grant execute on function public.admin_review_pharmacy_document(uuid, public.pharmacy_verification_status, text) to authenticated;
grant execute on function public.admin_review_pharmacy(uuid, public.pharmacy_verification_status, text) to authenticated;

drop policy if exists "owner_submit_own_verification_documents" on public.pharmacy_verification_documents;
create policy "owner_submit_own_verification_documents"
on public.pharmacy_verification_documents for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and (storage_path like auth.uid()::text || '/' || pharmacy_id::text || '/' || document_type::text || '/%')
  and exists (
    select 1
    from public.pharmacies p
    where p.id = pharmacy_id and p.owner_user_id = auth.uid()
  )
  and exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'onecall-verification' and o.name = storage_path
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'onecall-verification',
  'onecall-verification',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "verification_files_owner_or_admin_read" on storage.objects;
create policy "verification_files_owner_or_admin_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'onecall-verification'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1 from public.pharmacies p
        where p.id::text = (storage.foldername(name))[2]
          and p.owner_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "verification_files_owner_upload" on storage.objects;
create policy "verification_files_owner_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'onecall-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[3] in ('aadhaar', 'pharmacy_license', 'owner_photo', 'shop_photo')
  and exists (
    select 1 from public.pharmacies p
    where p.id::text = (storage.foldername(name))[2]
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists "verification_files_owner_delete" on storage.objects;
create policy "verification_files_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'onecall-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.pharmacies p
    where p.id::text = (storage.foldername(name))[2]
      and p.owner_user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
