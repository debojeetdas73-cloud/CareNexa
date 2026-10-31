# OneCallPharmacy – Hospital Directory Update

## What changed
- Added **Find hospitals** beside the medicine search on the public home page.
- Added `/hospitals` with search by hospital name, city, district, state and department, plus a city filter.
- Added `/hospitals/:id` detail pages with About, rating/reviews, beds, established year, departments, doctors, facilities, services and contact details.
- Added hospital shortcuts to the existing customer dashboard.
- Kept the existing Supabase Auth setup and customer login. The hospital directory does not create a second login system.
- Added the Supabase migration at `supabase/migrations/202610310001_hospital_directory.sql`.

## Setup
1. Extract this project and open its root folder in VS Code.
2. Keep your existing root `.env` file locally. It is intentionally **not included** in this ZIP to protect your Supabase credentials.
3. If needed, copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. In Supabase Dashboard → SQL Editor, run the migration file:
   `supabase/migrations/202610310001_hospital_directory.sql`
   Alternatively, if you use Supabase CLI, run `supabase db push`.
5. Add hospital records to `public.hospitals` and set `status = 'approved'` for records that should be visible to customers. Pending/rejected/inactive hospitals are hidden.
6. Install dependencies with `npm install`, then start using `npm run dev`.

## Adding a hospital
Use Supabase Table Editor → `hospitals` → Insert row. Required fields are `name`, `state`, `district`, `city`, and `address`. Set `status` to `pending` initially. An administrator can approve it by changing `status` to `approved`.

- `departments`, `facilities`, `services`: PostgreSQL text arrays, e.g. `{"Cardiology","Neurology"}`.
- `doctors`: JSON array, e.g.
  `[{"name":"Dr. Example","specialty":"Cardiology","qualification":"MBBS, MD","experience":"12 years","fee":"₹700"}]`
- `image_url` and `banner_url`: publicly accessible image URLs (or public Supabase Storage URLs).
- `rating`, `review_count`, `bed_count`, `established_year`: optional directory information.

## Access control
The migration enables RLS. Anonymous and authenticated visitors can read only approved hospitals. Only users for whom the existing `public.is_admin()` function returns true can insert, update, approve, reject or delete hospital records. This uses the existing admin authorization; no separate hospital-admin login was introduced.

## Important data note
The hospital listing starts empty until real hospital records are inserted and approved. No fictional hospitals, doctor profiles, ratings, phone numbers or addresses have been seeded.
