# OneCallPharmacy — database-connected build

## Important: the UI is now wired to Supabase, but it will show no pharmacies until you configure and seed the database.

### What changed in this package
- Removed hard-coded sample pharmacy objects from `src/data/pharmacies.ts`; it now contains types only.
- Removed the bundled static medicine array from `src/data/medicines.ts`; it now contains types only.
- `src/pages/Index.tsx` now queries live pharmacy records and inventory through `src/lib/pharmacyData.ts`.
- `src/pages/PharmacyDetail.tsx` loads the selected pharmacy and its in-stock medicines from Supabase by UUID.
- `src/components/OrderModal.tsx` submits the order through the database RPC. It no longer displays success before saving the order.
- Added Supabase client setup and migration SQL.

### Setup steps
1. In Supabase, create/open the project you want this website to use.
2. In the project root, run:
   ```bash
   npm install
   ```
   The package now declares `@supabase/supabase-js`.
3. Copy `.env.example` to `.env` in the project root (Vite does not load `.env.example`) and set:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```
   Use the publishable/anon key only in browser code. Never use a service-role key in `.env` for a frontend Vite app.
   Restart `npm run dev` after changing `.env`. The local `.env` is ignored by Git; do not commit it.
4. Review `supabase/migrations/202610050001_initial_pharmacy_inventory.sql`. Back up and reconcile first if the Supabase project already has tables or production data. Apply the migration in Supabase SQL Editor or through the Supabase CLI.
5. Import your own medicine CSV into `public.medicines` after mapping:
   - `Medicine` → `name`
   - `Generic_Name` → `generic_name`
   - `Category` → `category`
   This project ZIP intentionally does not include a bundled medicine CSV or demo pharmacy/review records. Import your own medicine catalogue; stock, batch, expiry, purchase-cost and selling-price values must come from real pharmacy records.
6. Add real pharmacy rows to `public.pharmacies`, using UUID IDs and actual location/contact details.
7. Add `inventory` rows for each pharmacy and medicine. Set quantity, reorder level, selling price and average purchase cost. For batch/expiry tracking, also add `medicine_batches` rows.
8. Start the app with `npm run dev`. Search results come from Supabase; if the tables are empty, the website will correctly show no results rather than invented demo pharmacies.

### Known next integration work
- The existing visual search and detail pages are database-backed.
- The order modal saves a one-unit-per-selected-medicine order. Quantity controls can be added next.
- Admin/user role assignment remains a trusted Supabase operation; do not add self-service role escalation.
- New Auth signups are assigned the `customer` role by the migration. Do not let users self-assign admin/pharmacy-owner roles; assign roles through a trusted admin process.
- A customer order request does not reserve stock until the pharmacy sends its quote. The quote RPC reserves inventory and eligible batches; customer decline or pharmacy cancellation restores the reservation through a matching stock movement. Do not directly change order status or inventory rows to simulate a cancellation.
- Gross profit is revenue minus the saved cost of items sold, not net profit. Expenses and tax handling need additional accounting tables/rules.

## Marketplace workflow extension

Apply `supabase/migrations/202610060001_marketplace_workflow.sql` after the initial migration.

Apply `supabase/migrations/202610070001_pharmacy_onboarding.sql` after both earlier migrations to enable pharmacy owner registration. Pharmacy-owner signup (after email confirmation, if enabled) opens `/pharmacy-onboarding`. Submitting the required shop/contact/location details creates an inactive `pending` pharmacy record through the `register_pharmacy` RPC; it cannot appear in public search until an administrator approves it. The owner can then open the partner dashboard and see the pending verification state.

The onboarding form intentionally does not collect Aadhaar or identity documents. Those require a private storage bucket and a separately secured document-verification workflow.

Apply `supabase/migrations/202610080001_pharmacy_customer_geolocation.sql` after the pharmacy onboarding migration to save pharmacy GPS latitude, longitude and accuracy. Pharmacy owners explicitly tap **Use current location** while at the shop. Customers explicitly tap **Use my current location** on the homepage; their coordinates stay in browser memory and are used only to calculate nearby distances and apply the distance filter. Location permission requires HTTPS or localhost. If permission is denied, the user can retry after changing browser permissions; no customer GPS coordinates are sent to Supabase.

Apply `supabase/migrations/202610090001_pharmacy_inventory_operations.sql` after the earlier migrations to enable verified pharmacy owners to add medicines, record purchases and record manual sales. These operations run through transactional RPCs: purchases increase stock and create a batch and movement record; manual sales validate/decrement stock, consume non-expired batches by earliest expiry first and create a movement record. The dashboard actions remain unavailable to unapproved pharmacies at the database level.

Apply `supabase/migrations/202610100001_admin_console_and_verification.sql` after the inventory operations migration. It adds the analytics views and RPCs used by the admin revenue pages and creates the private `onecall-verification` Storage bucket. Pharmacy owners can upload the four verification documents from their dashboard profile; administrators can create short-lived previews, approve/reject each document, and move the pharmacy through pending, under-review, approved, rejected, and suspended states. The database refuses pharmacy approval until the latest version of every required document has been approved.

Apply `supabase/migrations/202610110001_order_workflow_and_admin_views.sql` after the admin console migration. It secures pharmacy order actions behind database RPCs, requires customers to sign in before ordering so they can respond to quotes, adds customer quote acceptance/decline, restores inventory and batch quantities on cancellation, prevents manual sales from consuming expired batches, and provides the admin stock/customer reporting views. The pharmacy flow is: signed-in customer requests medicines → pharmacy sends a final quote → customer accepts or declines → pharmacy prepares, marks ready, and completes the accepted order. Direct authenticated updates to order rows are revoked so a client cannot bypass the workflow.

Apply `supabase/migrations/202610120001_customer_demographics.sql` after the order workflow migration. It adds age, blood group, city, and district to customer profiles and saves the signup demographics for the admin blood group directory. The customer signup collects all four fields; customer sign-in opens the customer profile, while pharmacy-owner sign-in can continue to pharmacy onboarding.

Apply `supabase/migrations/202610150001_pharmacy_document_storage_fix.sql` after the earlier migrations if pharmacy verification document uploads fail. It ensures the private bucket's size/type settings and reinstalls the authenticated pharmacy-owner upload policy.

Apply `supabase/migrations/20261024051635_pharmacy_verification_upload_rls_fix.sql` after the storage fix before uploading verification documents. It reinstalls the owner-scoped Storage upload/read policies and the metadata-table insert policy. Applying migrations to the repository does not update the hosted Supabase project: apply this file through that project's SQL Editor or run `supabase db push` while linked to the same project configured by `VITE_SUPABASE_URL`.

Apply `supabase/migrations/20261024054900_fix_pharmacy_verification_storage_name_ambiguity.sql` after the previous verification-upload migration. It qualifies the outer `storage.objects.name` in the Storage policy subqueries; without qualification, PostgreSQL resolves `name` to `pharmacies.name` inside those subqueries and rejects valid owner uploads.

Apply `supabase/migrations/20261029153428_prescription_orders_and_storage.sql` after the existing pharmacy and order migrations. It creates the private prescription bucket and the initial owner/customer-scoped request table.

Apply `supabase/migrations/20261029160752_prescription_broadcast_and_quote_flow.sql` after the prescription storage migration. It adds five-minute nearby pharmacy broadcasts (within 15 km), pharmacy notifications and realtime updates, first-acceptance claiming, private prescription previews after acceptance, rejection/reassignment, customer retry/direct-pharmacy selection, and pharmacy inventory search/discount quotes that appear in the customer's order history. The customer chooses delivery or pickup before upload; delivery requests include the address and distance for the accepting pharmacy. Pharmacy owners must enable browser sound in the portal; browsers only allow alert audio after a user gesture. Applying these files to the repository does not update the hosted Supabase project: apply both prescription migrations through that project's SQL Editor or run `supabase db push` while linked to the project configured by `VITE_SUPABASE_URL`.

The admin console includes verification, orders, inventory, customers, blood groups, medicine performance, and revenue explorer sections. The blood group directory shows patient name, age, blood group, city, district, and phone, with filters for name, blood group, and city. It reports stock/customer activity but does not directly edit pharmacy stock or customer orders; the pharmacy dashboard owns operational updates and the database validates each order transition.

New routes included in this package:
- `/account`: customer or pharmacy-owner sign-up/sign-in
- `/profile`: customer profile and order history
- `/pharmacy-dashboard`: pharmacy stock and orders overview
- `/admin`: admin overview, pharmacy verification/document review, medicine performance, and revenue explorer

The pharmacy result card and map no longer show prices to customers.

### Important limitations — not production-complete yet
This is a scaffold/integration increment, not a fully audited marketplace release:
- Verification files contain sensitive personal/business information. Keep the bucket private, use the supplied short-lived signed-preview flow, and apply the latest migration before collecting documents. Do not collect Aadhaar by plain text or publish verification documents.
- New users are created as `customer` by the base migration. An administrator must promote a pharmacy owner through a trusted process after identity checks. Do not trust the `requested_role` sent from the browser.
- The admin route checks the role for display, while database RLS and admin-only RPCs protect the underlying data. Apply migrations in order to the hosted project; local source changes do not install database functions or Storage policies remotely.
- Quote and stock reservation/cancellation behavior should be tested with concurrent quote attempts, failed reservations, cancellations, and partial batch availability before live orders.
- Payment processing, SMS/push notifications, delivery tracking, and settlements are not yet implemented.
- Never expose a service-role key to the browser. Configure Auth, private Storage, RLS, email verification and backups before using real customer data.

## Sign-up, database writes and confirmation email

- A Supabase project URL by itself is not enough: both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be present in the root `.env`. The app now fails explicitly instead of silently writing fake data to browser local storage when Supabase is not configured.
- Creating an account writes to Supabase Auth. The initial migration's trigger creates the matching `public.profiles` row. Sign-up does not add pharmacies, medicines or inventory; those tables need real records imported or entered separately.
- When email confirmation is enabled, the app reports the pending confirmation state and offers a resend action. Confirm that the Supabase Auth email provider has email confirmations enabled and that the project's Site URL and allowed Redirect URLs include the website origin (for local development, `http://localhost:8080/**`).
- Supabase's built-in email sender is intended for testing and is restricted/rate-limited. For delivery to real customer addresses, configure a custom SMTP provider under Supabase Auth SMTP settings. Check spam and the provider's delivery logs if Supabase accepts the request but the email does not arrive.
- Pharmacy-owner selection is only a request. The migration creates new profiles with the customer role; a trusted administrator must assign an owner role after verification.


## Static data removal clarification
- No hard-coded pharmacy catalogue or medicine catalogue is shipped in the frontend.
- Medicine categories are loaded from `public.medicines`.
- Pharmacy listings and stock are loaded from Supabase.
- Pharmacy reviews are loaded from `public.pharmacy_reviews`; no demo reviews are included.
- The bundled 5,000-medicine CSV and its CSV parser helper were removed from this ZIP. Import a dataset into Supabase yourself if needed.
- Without configured Supabase credentials and populated tables, the app will show an empty/error state rather than fake sample records.
