import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, CircleAlert, ClipboardList, MapPin, PackageCheck, Plus, Search, Truck, X } from "lucide-react";
import { requireSupabase } from "@/lib/supabase";

type Distributor = {
  id: string; created_by: string | null; company_name: string; contact_person: string; phone: string;
  email: string | null; address: string; city: string; service_area: string | null;
  medicine_categories: string[]; delivery_information: string | null; sharing_scope: "private" | "shared";
};
type PharmacyDistributor = { id: string; pharmacy_id: string; distributor_id: string; is_active: boolean; is_preferred: boolean };
type DirectoryEntry = Distributor & { pharmacy_distributor_id: string | null; is_preferred: boolean; pharmacy_link_active: boolean };
type Medicine = { id: string; name: string; generic_name: string | null; category: string | null; strength: string | null; dosage_form: string | null; pack_size: string | null };
type Listing = { id: string; pharmacy_distributor_id: string; medicine_id: string; unit_price: number | null; minimum_order_quantity: number | null; is_available: boolean };
type PurchaseOrder = { id: string; pharmacy_id: string; pharmacy_distributor_id: string | null; distributor_id: string; status: string; order_date: string; total_amount: number; delivery_instructions: string | null };
type OrderItem = { id: string; order_id: string; pharmacy_distributor_medicine_id: string | null; medicine_id: string; quantity_ordered: number; quantity_received: number; unit_price: number; line_total: number };
type ReceiptDraft = { quantity: string; batch: string; expiry: string; manufactured: string; selling: string };
type InventoryPrice = { medicine_id: string; selling_price: number };

const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const money = (value: number | string | null | undefined) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800", accepted: "bg-blue-50 text-blue-800", processing: "bg-indigo-50 text-indigo-800",
  dispatched: "bg-violet-50 text-violet-800", partially_received: "bg-orange-50 text-orange-800", received: "bg-emerald-50 text-emerald-800", cancelled: "bg-slate-100 text-slate-600",
};
const statusLabel = (status: string) => status.replace(/_/g, " ");

export default function DistributorManagement({ pharmacyId, canManage, initialMedicineId, initialQuantity, onInventoryRefresh }: {
  pharmacyId: string; canManage: boolean; initialMedicineId?: string; initialQuantity?: number; onInventoryRefresh: () => Promise<void>;
}) {
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [pharmacyDistributors, setPharmacyDistributors] = useState<PharmacyDistributor[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [inventoryPrices, setInventoryPrices] = useState<InventoryPrice[]>([]);
  const [selectedAssociationId, setSelectedAssociationId] = useState("");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, string>>({});
  const [orderReviewOpen, setOrderReviewOpen] = useState(false);
  const [receiptDrafts, setReceiptDrafts] = useState<Record<string, ReceiptDraft>>({});
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
  const [receiptAttempts, setReceiptAttempts] = useState<Record<string, { key: string; fingerprint: string }>>({});
  const [openReceiptId, setOpenReceiptId] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [medicineFilter, setMedicineFilter] = useState("");
  const [catalogPrice, setCatalogPrice] = useState("");
  const [catalogMinimum, setCatalogMinimum] = useState("");
  const [catalogAvailable, setCatalogAvailable] = useState(true);
  const [editTarget, setEditTarget] = useState<DirectoryEntry | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const prefillApplied = useRef(false);

  const medicineById = useMemo(() => new Map(medicines.map((medicine) => [medicine.id, medicine])), [medicines]);
  const directory = useMemo<DirectoryEntry[]>(() => {
    const distributorById = new Map(distributors.map((distributor) => [distributor.id, distributor]));
    const links = pharmacyDistributors.flatMap((link) => {
      const distributor = distributorById.get(link.distributor_id);
      return distributor ? [{ ...distributor, pharmacy_distributor_id: link.id, is_preferred: link.is_preferred, pharmacy_link_active: link.is_active }] : [];
    });
    const linkedIds = new Set(pharmacyDistributors.map((link) => link.distributor_id));
    const shared = distributors.filter((distributor) => distributor.sharing_scope === "shared" && !linkedIds.has(distributor.id))
      .map((distributor) => ({ ...distributor, pharmacy_distributor_id: null, is_preferred: false, pharmacy_link_active: false }));
    return [...links, ...shared];
  }, [distributors, pharmacyDistributors]);
  const selectedDistributor = directory.find((entry) => entry.pharmacy_distributor_id === selectedAssociationId) || null;
  const categories = [...new Set(directory.flatMap((distributor) => distributor.medicine_categories || []))].sort();
  const locations = [...new Set(directory.map((distributor) => distributor.city).filter(Boolean))].sort();
  const visibleDistributors = directory.filter((distributor) => {
    const query = search.trim().toLowerCase();
    return (!query || `${distributor.company_name} ${distributor.contact_person}`.toLowerCase().includes(query))
      && (!locationFilter || distributor.city === locationFilter || (distributor.service_area || "").toLowerCase().includes(locationFilter.toLowerCase()))
      && (!categoryFilter || distributor.medicine_categories?.includes(categoryFilter));
  });
  const selectedListings = listings.filter((listing) => listing.pharmacy_distributor_id === selectedAssociationId && listing.is_available);
  const selectedOrders = orders.filter((order) => order.pharmacy_distributor_id === selectedAssociationId
    || (!order.pharmacy_distributor_id && order.distributor_id === selectedDistributor?.id));

  const load = useCallback(async () => {
    if (!pharmacyId) return;
    setLoading(true); setError("");
    try {
      const db = requireSupabase();
      const [{ data: authData, error: authError }, distributorRows, linkRows, productRows, medicineRows, orderRows, itemRows, priceRows] = await Promise.all([
        db.auth.getUser(),
        db.from("distributors").select("id,created_by,company_name,contact_person,phone,email,address,city,service_area,medicine_categories,delivery_information,sharing_scope").order("company_name"),
        db.from("pharmacy_distributors").select("id,pharmacy_id,distributor_id,is_active,is_preferred").eq("pharmacy_id", pharmacyId),
        db.from("pharmacy_distributor_medicines").select("id,pharmacy_distributor_id,medicine_id,unit_price,minimum_order_quantity,is_available"),
        db.from("medicines").select("id,name,generic_name,category,strength,dosage_form,pack_size").order("name").limit(2000),
        db.from("distributor_purchase_orders").select("id,pharmacy_id,pharmacy_distributor_id,distributor_id,status,order_date,total_amount,delivery_instructions").eq("pharmacy_id", pharmacyId).order("order_date", { ascending: false }).limit(200),
        db.from("distributor_purchase_order_items").select("id,order_id,pharmacy_distributor_medicine_id,medicine_id,quantity_ordered,quantity_received,unit_price,line_total"),
        db.from("inventory").select("medicine_id,selling_price").eq("pharmacy_id", pharmacyId),
      ]);
      if (authError) throw authError;
      const failure = [distributorRows, linkRows, productRows, medicineRows, orderRows, itemRows, priceRows].find((result) => result.error);
      if (failure?.error) throw failure.error;
      setCurrentUserId(authData.user?.id || "");
      setDistributors((distributorRows.data || []) as Distributor[]);
      setPharmacyDistributors((linkRows.data || []) as PharmacyDistributor[]);
      setListings((productRows.data || []) as Listing[]);
      setMedicines((medicineRows.data || []) as Medicine[]);
      setOrders((orderRows.data || []) as PurchaseOrder[]);
      setOrderItems((itemRows.data || []) as OrderItem[]);
      setInventoryPrices((priceRows.data || []) as InventoryPrice[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this pharmacy's distributors.");
    } finally { setLoading(false); }
  }, [pharmacyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (selectedAssociationId || pharmacyDistributors.length === 0) return;
    setSelectedAssociationId(pharmacyDistributors.find((link) => link.is_preferred && link.is_active)?.id || pharmacyDistributors.find((link) => link.is_active)?.id || "");
  }, [selectedAssociationId, pharmacyDistributors]);
  useEffect(() => {
    if (prefillApplied.current || !initialMedicineId || !directory.length) return;
    const match = directory.find((distributor) => distributor.pharmacy_distributor_id && distributor.pharmacy_link_active && listings.some((listing) => listing.pharmacy_distributor_id === distributor.pharmacy_distributor_id && listing.medicine_id === initialMedicineId && listing.is_available));
    if (match?.pharmacy_distributor_id) {
      setSelectedAssociationId(match.pharmacy_distributor_id);
      const listing = listings.find((item) => item.pharmacy_distributor_id === match.pharmacy_distributor_id && item.medicine_id === initialMedicineId && item.is_available);
      if (listing) setSelectedQuantities((current) => ({ ...current, [listing.id]: String(Math.max(initialQuantity || 1, listing.minimum_order_quantity || 1)) }));
    }
    prefillApplied.current = true;
  }, [directory, listings, initialMedicineId, initialQuantity]);

  async function addDistributor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage) return; setBusy(true); setError(""); setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const { data, error: saveError } = await requireSupabase().rpc("add_pharmacy_distributor", { p_pharmacy_id: pharmacyId, ...distributorArgs(form) });
      if (saveError) throw saveError;
      setNotice("Supplier added to this pharmacy's distributor list.");
      if (typeof data === "string") setSelectedAssociationId(data);
      formElement.reset(); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add this distributor."); }
    finally { setBusy(false); }
  }

  async function updateDistributor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage || !editTarget?.pharmacy_distributor_id) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: saveError } = await requireSupabase().rpc("update_pharmacy_distributor", {
        p_pharmacy_distributor_id: editTarget.pharmacy_distributor_id,
        ...distributorArgs(new FormData(event.currentTarget)),
      });
      if (saveError) throw saveError;
      setNotice("Supplier contact information updated."); setEditTarget(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update distributor details."); }
    finally { setBusy(false); }
  }

  async function linkSharedDistributor(distributorId: string) {
    if (!canManage) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error: linkError } = await requireSupabase().rpc("link_shared_distributor", { p_pharmacy_id: pharmacyId, p_distributor_id: distributorId });
      if (linkError) throw linkError;
      if (typeof data === "string") setSelectedAssociationId(data);
      setNotice("Shared supplier added to this pharmacy's list."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add the shared supplier."); }
    finally { setBusy(false); }
  }

  async function updateAssociation(entry: DirectoryEntry, isActive: boolean, isPreferred: boolean) {
    if (!canManage || !entry.pharmacy_distributor_id) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: updateError } = await requireSupabase().rpc("set_pharmacy_distributor_status", {
        p_pharmacy_distributor_id: entry.pharmacy_distributor_id, p_is_active: isActive, p_is_preferred: isPreferred,
      });
      if (updateError) throw updateError;
      setNotice("Your pharmacy's supplier settings were saved."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update supplier settings."); }
    finally { setBusy(false); }
  }

  async function saveListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage || !selectedAssociationId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: saveError } = await requireSupabase().rpc("save_pharmacy_distributor_medicine", {
        p_pharmacy_distributor_id: selectedAssociationId, p_medicine_id: medicineFilter,
        p_unit_price: catalogPrice === "" ? null : Number(catalogPrice),
        p_minimum_order_quantity: catalogMinimum === "" ? null : Number(catalogMinimum), p_is_available: catalogAvailable,
      });
      if (saveError) throw saveError;
      setNotice("Supplier medicine and pharmacy-specific price saved."); setMedicineFilter(""); setCatalogPrice(""); setCatalogMinimum(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this medicine listing."); }
    finally { setBusy(false); }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedDistributor?.pharmacy_distributor_id || !canManage || !selectedDistributor.pharmacy_link_active) return;
    const items = selectedListings.map((listing) => ({ listing, quantity: Number(selectedQuantities[listing.id] || 0) })).filter((line) => line.quantity > 0);
    if (!items.length) { setError("Enter a quantity for at least one supplied medicine."); return; }
    const invalid = items.find(({ listing, quantity }) => !Number.isInteger(quantity) || listing.unit_price === null || (listing.minimum_order_quantity && quantity < listing.minimum_order_quantity));
    if (invalid) { setError("Check the quantities against the supplier's configured prices and minimums."); return; }
    if (!orderReviewOpen) { setOrderReviewOpen(true); setError(""); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: createError } = await requireSupabase().rpc("create_distributor_purchase_order", {
        p_pharmacy_distributor_id: selectedDistributor.pharmacy_distributor_id,
        p_items: items.map(({ listing, quantity }) => ({ pharmacy_distributor_medicine_id: listing.id, quantity })),
        p_delivery_instructions: deliveryInstructions.trim() || null,
      });
      if (createError) throw createError;
      setNotice("Purchase order recorded. Stock will change only after you confirm a goods receipt.");
      setSelectedQuantities({}); setDeliveryInstructions(""); setOrderReviewOpen(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit the purchase order."); }
    finally { setBusy(false); }
  }

  async function receiveOrder(event: FormEvent<HTMLFormElement>, order: PurchaseOrder) {
    event.preventDefault(); if (!canManage || order.pharmacy_id !== pharmacyId) return;
    const lines = orderItems.filter((item) => item.order_id === order.id).map((item) => ({ item, draft: receiptDrafts[item.id] || emptyReceiptDraft() }))
      .filter(({ draft }) => Number(draft.quantity) > 0);
    if (!lines.length) { setError("Enter a received quantity for at least one medicine."); return; }
    if (lines.some(({ item, draft }) => !Number.isInteger(Number(draft.quantity)) || Number(draft.quantity) > item.quantity_ordered - item.quantity_received || !draft.batch.trim() || !draft.expiry)) {
      setError("Enter a valid quantity, batch number, and expiry date within the outstanding quantity."); return;
    }
    const payload = lines.map(({ item, draft }) => ({
      order_item_id: item.id, quantity_received: Number(draft.quantity), batch_number: draft.batch.trim(), expiry_date: draft.expiry,
      manufacturing_date: draft.manufactured || null, selling_price: draft.selling === "" ? null : Number(draft.selling),
    }));
    const notes = receiptNotes[order.id]?.trim() || "";
    const fingerprint = JSON.stringify({ payload, notes });
    const previous = receiptAttempts[order.id];
    const key = previous?.fingerprint === fingerprint ? previous.key : crypto.randomUUID();
    setReceiptAttempts((current) => ({ ...current, [order.id]: { key, fingerprint } }));
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: receiptError } = await requireSupabase().rpc("record_distributor_goods_receipt", {
        p_order_id: order.id, p_idempotency_key: key, p_lines: payload, p_notes: notes || null,
      });
      if (receiptError) throw receiptError;
      setNotice("Receipt confirmed. Inventory, batches, stock history, and order status were updated.");
      setReceiptDrafts((current) => { const next = { ...current }; orderItems.filter((item) => item.order_id === order.id).forEach((item) => { delete next[item.id]; }); return next; });
      setReceiptNotes((current) => ({ ...current, [order.id]: "" }));
      setReceiptAttempts((current) => { const next = { ...current }; delete next[order.id]; return next; });
      await Promise.all([load(), onInventoryRefresh()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record this goods receipt."); }
    finally { setBusy(false); }
  }

  async function updateOrderStatus(order: PurchaseOrder, status: string) {
    if (!canManage || order.pharmacy_id !== pharmacyId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: updateError } = await requireSupabase().rpc("update_distributor_purchase_order_status", { p_order_id: order.id, p_status: status });
      if (updateError) throw updateError;
      setNotice(`Order status recorded as ${statusLabel(status)}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update purchase order status."); }
    finally { setBusy(false); }
  }

  const ownListings = listings.filter((listing) => listing.pharmacy_distributor_id === selectedAssociationId);
  const orderTotal = selectedListings.reduce((total, listing) => total + Number(selectedQuantities[listing.id] || 0) * Number(listing.unit_price || 0), 0);

  return <div className="space-y-5">
    {error && <AlertBox kind="error" text={error} onClose={() => setError("")} />}
    {notice && <AlertBox kind="success" text={notice} onClose={() => setNotice("")} />}
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500" role="status">Loading your pharmacy's distributors…</div> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-extrabold">Your distributors</h2><p className="mt-1 text-sm text-slate-500">Manage suppliers used by this pharmacy. Private contacts are visible only here; shared contacts can be linked by other pharmacies.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{visibleDistributors.length} suppliers</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="relative sm:col-span-2"><span className="sr-only">Search distributor</span><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search supplier or contact" className={`${fieldClass} pl-9`} /></label>
          <label><span className="sr-only">Filter by location</span><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className={fieldClass}><option value="">All locations</option>{locations.map((city) => <option key={city}>{city}</option>)}</select></label>
          <label><span className="sr-only">Filter by medicine category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={fieldClass}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        </div>
        {visibleDistributors.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleDistributors.map((entry) => <article key={`${entry.id}:${entry.pharmacy_distributor_id || "common"}`} className={`rounded-xl border p-4 transition ${entry.pharmacy_distributor_id === selectedAssociationId ? "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-200" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-2"><div><h3 className="font-extrabold">{entry.company_name}</h3><p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><MapPin size={14} />{entry.city}{entry.service_area ? ` · ${entry.service_area}` : ""}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${entry.sharing_scope === "shared" ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{entry.sharing_scope === "shared" ? "Shared contact" : "Private contact"}</span></div>
            <p className="mt-2 text-xs text-slate-500">{entry.medicine_categories?.join(" · ") || "Categories not provided"}</p>
            {entry.pharmacy_distributor_id ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedAssociationId(entry.pharmacy_distributor_id || "")} className="min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">View supplier</button>{entry.is_preferred && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 text-xs font-bold text-amber-800">Preferred</span>}{!entry.pharmacy_link_active && <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 text-xs font-bold text-slate-600">Inactive</span>}</div>
              : <button type="button" disabled={busy || !canManage} onClick={() => void linkSharedDistributor(entry.id)} className="mt-3 min-h-9 rounded-lg border border-blue-200 px-3 text-xs font-bold text-blue-800 disabled:opacity-50">Add shared supplier to this pharmacy</button>}
          </article>)}
        </div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center"><p className="font-bold">No supplier matches these filters</p><p className="mt-1 text-sm text-slate-500">Add your own contact or find a supplier another pharmacy has shared.</p><button type="button" onClick={() => { setSearch(""); setLocationFilter(""); setCategoryFilter(""); }} className="mt-3 text-sm font-bold text-emerald-800">Clear filters</button></div>}
      </section>

      {selectedDistributor?.pharmacy_distributor_id && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Supplier for this pharmacy</p><h2 className="mt-1 text-xl font-extrabold">{selectedDistributor.company_name}</h2><p className="mt-1 text-sm text-slate-500">{selectedDistributor.address}, {selectedDistributor.city}{selectedDistributor.service_area ? ` · Serves ${selectedDistributor.service_area}` : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${selectedDistributor.sharing_scope === "shared" ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{selectedDistributor.sharing_scope === "shared" ? "Shared contact" : "Private to this pharmacy"}</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Info label="Contact person" value={selectedDistributor.contact_person} /><Info label="Phone" value={selectedDistributor.phone} link={`tel:${selectedDistributor.phone}`} /><Info label="Email" value={selectedDistributor.email || "Not provided"} link={selectedDistributor.email ? `mailto:${selectedDistributor.email}` : undefined} /><Info label="Categories" value={selectedDistributor.medicine_categories?.join(", ") || "Not provided"} /></div>
        <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Delivery information</p><p className="mt-1 text-sm">{selectedDistributor.delivery_information || "Contact the supplier for delivery arrangements."}</p></div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(selectedDistributor.created_by === currentUserId || (!selectedDistributor.created_by && selectedDistributor.sharing_scope === "private")) && <button type="button" disabled={!canManage} onClick={() => setEditTarget(selectedDistributor)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:opacity-50">Edit supplier contact</button>}
          <button type="button" disabled={busy || !canManage} onClick={() => void updateAssociation(selectedDistributor, selectedDistributor.pharmacy_link_active, !selectedDistributor.is_preferred)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:opacity-50">{selectedDistributor.is_preferred ? "Remove preferred" : "Set as preferred"}</button>
          <button type="button" disabled={busy || !canManage} onClick={() => void updateAssociation(selectedDistributor, !selectedDistributor.pharmacy_link_active, selectedDistributor.is_preferred)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:opacity-50">{selectedDistributor.pharmacy_link_active ? "Deactivate for this pharmacy" : "Reactivate for this pharmacy"}</button>
        </div>

        {editTarget && <details open className="mt-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-bold">Edit supplier contact</summary><DistributorForm key={editTarget.id} initial={editTarget} busy={busy} canManage={canManage} submitLabel="Save supplier details" onSubmit={updateDistributor} onCancel={() => setEditTarget(null)} /></details>}

        <div className="mt-5 flex items-center gap-2"><PackageCheck size={18} className="text-emerald-700" /><h3 className="font-extrabold">Medicines supplied to this pharmacy</h3></div>
        {selectedListings.length ? <form onSubmit={(event) => void createOrder(event)}>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Medicine</th><th className="px-3 py-3">Unit price</th><th className="px-3 py-3">Minimum</th><th className="w-36 px-3 py-3">Order quantity</th></tr></thead><tbody>
            {selectedListings.map((listing) => { const medicine = medicineById.get(listing.medicine_id); return <tr key={listing.id} className="border-t border-slate-100"><td className="px-3 py-3 font-semibold">{medicineLabel(medicine)}{medicine?.category && <span className="block text-xs font-normal text-slate-500">{medicine.category}</span>}</td><td className="px-3 py-3">{listing.unit_price === null ? "Price not configured" : money(listing.unit_price)}</td><td className="px-3 py-3">{listing.minimum_order_quantity || "No minimum"}</td><td className="px-3 py-3"><input type="number" min={listing.minimum_order_quantity || 0} step="1" value={selectedQuantities[listing.id] || ""} onChange={(event) => { setSelectedQuantities((current) => ({ ...current, [listing.id]: event.target.value })); setOrderReviewOpen(false); }} aria-label={`Order quantity for ${medicine?.name || "medicine"}`} className="min-h-10 w-full rounded-lg border border-slate-200 px-2" disabled={!canManage || !selectedDistributor.pharmacy_link_active || listing.unit_price === null} /></td></tr>; })}
          </tbody></table></div>
          <label className="mt-3 block text-sm font-bold">Delivery instructions<textarea value={deliveryInstructions} onChange={(event) => { setDeliveryInstructions(event.target.value); setOrderReviewOpen(false); }} maxLength={1000} rows={2} className={fieldClass} placeholder="Delivery address, preferred time, or other instructions" /></label>
          {orderReviewOpen && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><h4 className="font-extrabold">Review your order</h4><div className="mt-2 space-y-1 text-sm">{selectedListings.filter((listing) => Number(selectedQuantities[listing.id]) > 0).map((listing) => <p key={listing.id}>{medicineLabel(medicineById.get(listing.medicine_id))}: {selectedQuantities[listing.id]} × {money(listing.unit_price)} = {money(Number(selectedQuantities[listing.id]) * Number(listing.unit_price))}</p>)}</div><p className="mt-2 text-sm">Delivery: {deliveryInstructions.trim() || "No additional instructions"}</p></div>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Order total <strong className="ml-2 text-lg">{money(orderTotal)}</strong></p><div className="flex gap-2">{orderReviewOpen && <button type="button" onClick={() => setOrderReviewOpen(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold">Edit order</button>}<button type="submit" disabled={!canManage || !selectedDistributor.pharmacy_link_active || busy || !selectedListings.some((listing) => Number(selectedQuantities[listing.id]) > 0)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"><ClipboardList size={16} />{busy ? "Submitting…" : orderReviewOpen ? "Confirm and place order" : "Review order"}</button></div></div>
          <p className="mt-2 text-xs text-slate-500">Prices and minimums are specific to this pharmacy. Creating the order does not change stock.</p>
        </form> : <div className="mt-3"><p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No medicines are configured for this supplier and pharmacy.</p><CatalogueForm medicines={medicines} medicineId={medicineFilter} setMedicineId={setMedicineFilter} price={catalogPrice} setPrice={setCatalogPrice} minimum={catalogMinimum} setMinimum={setCatalogMinimum} available={catalogAvailable} setAvailable={setCatalogAvailable} busy={busy} canManage={canManage} onSubmit={saveListing} /></div>}
        {selectedListings.length > 0 && <CatalogueForm medicines={medicines} medicineId={medicineFilter} setMedicineId={setMedicineFilter} price={catalogPrice} setPrice={setCatalogPrice} minimum={catalogMinimum} setMinimum={setCatalogMinimum} available={catalogAvailable} setAvailable={setCatalogAvailable} busy={busy} canManage={canManage} onSubmit={saveListing} />}
        {ownListings.length > 0 && <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">{ownListings.map((listing) => <div key={listing.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"><span className="font-semibold">{medicineLabel(medicineById.get(listing.medicine_id))}</span><span className="text-slate-500">{listing.unit_price === null ? "Price not set" : money(listing.unit_price)} · minimum {listing.minimum_order_quantity || "not set"} · {listing.is_available ? "Available" : "Unavailable"}</span><button type="button" onClick={() => { setMedicineFilter(listing.medicine_id); setCatalogPrice(listing.unit_price === null ? "" : String(listing.unit_price)); setCatalogMinimum(listing.minimum_order_quantity ? String(listing.minimum_order_quantity) : ""); setCatalogAvailable(listing.is_available); }} className="text-xs font-bold text-emerald-800">Edit listing</button></div>)}</div>}
      </section>}

      {selectedDistributor?.pharmacy_distributor_id && <OrderHistory orders={selectedOrders} orderItems={orderItems} medicineById={medicineById} inventoryPrices={inventoryPrices} pharmacyId={pharmacyId} canManage={canManage} busy={busy} openReceiptId={openReceiptId} setOpenReceiptId={setOpenReceiptId} receiptDrafts={receiptDrafts} setReceiptDrafts={setReceiptDrafts} receiptNotes={receiptNotes} setReceiptNotes={setReceiptNotes} receiveOrder={receiveOrder} updateOrderStatus={updateOrderStatus} />}
      <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><summary className="cursor-pointer font-extrabold">Add a distributor to this pharmacy</summary><p className="mt-1 text-sm text-slate-500">Save a private supplier contact, or share it so other pharmacies can add the same common supplier. Catalogue prices remain pharmacy-specific.</p><DistributorForm busy={busy} canManage={canManage} submitLabel="Add distributor" onSubmit={addDistributor} /></details>
      <p className="text-xs text-slate-500">Payment history is not tracked by the current pharmacy database.</p>
    </>}
  </div>;
}

function distributorArgs(form: FormData) {
  return {
    p_company_name: String(form.get("company_name") || "").trim(), p_contact_person: String(form.get("contact_person") || "").trim(),
    p_phone: String(form.get("phone") || "").trim(), p_email: String(form.get("email") || "").trim() || null,
    p_address: String(form.get("address") || "").trim(), p_city: String(form.get("city") || "").trim(),
    p_service_area: String(form.get("service_area") || "").trim() || null,
    p_medicine_categories: String(form.get("medicine_categories") || "").split(",").map((value) => value.trim()).filter(Boolean),
    p_delivery_information: String(form.get("delivery_information") || "").trim() || null,
    p_sharing_scope: form.get("sharing_scope") === "shared" ? "shared" : "private",
  };
}

function DistributorForm({ initial, busy, canManage, submitLabel, onSubmit, onCancel }: {
  initial?: DirectoryEntry; busy: boolean; canManage: boolean; submitLabel: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel?: () => void;
}) {
  return <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-sm font-bold">Company name<input required minLength={2} maxLength={160} name="company_name" defaultValue={initial?.company_name || ""} className={fieldClass} /></label>
    <label className="text-sm font-bold">Contact person<input required minLength={2} name="contact_person" defaultValue={initial?.contact_person || ""} className={fieldClass} /></label>
    <label className="text-sm font-bold">Phone<input required type="tel" name="phone" defaultValue={initial?.phone || ""} className={fieldClass} /></label>
    <label className="text-sm font-bold">Email<input type="email" name="email" defaultValue={initial?.email || ""} className={fieldClass} /></label>
    <label className="text-sm font-bold sm:col-span-2">Address<input required name="address" defaultValue={initial?.address || ""} className={fieldClass} /></label>
    <label className="text-sm font-bold">City<input required name="city" defaultValue={initial?.city || ""} className={fieldClass} /></label>
    <label className="text-sm font-bold">Service area<input name="service_area" defaultValue={initial?.service_area || ""} className={fieldClass} placeholder="Districts or regions served" /></label>
    <label className="text-sm font-bold sm:col-span-2">Medicine categories<input name="medicine_categories" defaultValue={initial?.medicine_categories?.join(", ") || ""} className={fieldClass} placeholder="Comma-separated categories" /></label>
    <label className="text-sm font-bold sm:col-span-2">Delivery information<textarea name="delivery_information" defaultValue={initial?.delivery_information || ""} rows={2} className={fieldClass} placeholder="Delivery days, coverage, or arrangements" /></label>
    <fieldset className="sm:col-span-2"><legend className="text-sm font-bold">Contact visibility</legend><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" name="sharing_scope" value="private" defaultChecked={initial?.sharing_scope !== "shared"} />Private to this pharmacy</label><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" name="sharing_scope" value="shared" defaultChecked={initial?.sharing_scope === "shared"} />Share contact with other pharmacies</label></fieldset>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={busy || !canManage} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : submitLabel}</button>{onCancel && <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold">Cancel</button>}</div>
  </form>;
}

function CatalogueForm({ medicines, medicineId, setMedicineId, price, setPrice, minimum, setMinimum, available, setAvailable, busy, canManage, onSubmit }: {
  medicines: Medicine[]; medicineId: string; setMedicineId: (value: string) => void; price: string; setPrice: (value: string) => void;
  minimum: string; setMinimum: (value: string) => void; available: boolean; setAvailable: (value: boolean) => void; busy: boolean; canManage: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <details className="mt-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-bold">Add or update a supplied medicine</summary><form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <label className="text-sm font-bold xl:col-span-2">Medicine<select required value={medicineId} onChange={(event) => setMedicineId(event.target.value)} className={fieldClass}><option value="">Choose a medicine</option>{medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicineLabel(medicine)}</option>)}</select></label>
    <label className="text-sm font-bold">Unit price<input value={price} onChange={(event) => setPrice(event.target.value)} type="number" min="0" step="0.01" className={fieldClass} placeholder="Optional" /></label>
    <label className="text-sm font-bold">Minimum quantity<input value={minimum} onChange={(event) => setMinimum(event.target.value)} type="number" min="1" step="1" className={fieldClass} placeholder="Optional" /></label>
    <div className="flex items-end gap-3"><label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} />Available</label><button type="submit" disabled={!medicineId || busy || !canManage} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-slate-800 px-3 text-sm font-bold text-white disabled:opacity-50"><Plus size={15} />Save</button></div>
  </form></details>;
}

function OrderHistory({ orders, orderItems, medicineById, inventoryPrices, pharmacyId, canManage, busy, openReceiptId, setOpenReceiptId, receiptDrafts, setReceiptDrafts, receiptNotes, setReceiptNotes, receiveOrder, updateOrderStatus }: {
  orders: PurchaseOrder[]; orderItems: OrderItem[]; medicineById: Map<string, Medicine>; inventoryPrices: InventoryPrice[]; pharmacyId: string; canManage: boolean; busy: boolean;
  openReceiptId: string; setOpenReceiptId: (id: string) => void; receiptDrafts: Record<string, ReceiptDraft>; setReceiptDrafts: (update: (current: Record<string, ReceiptDraft>) => Record<string, ReceiptDraft>) => void;
  receiptNotes: Record<string, string>; setReceiptNotes: (update: (current: Record<string, string>) => Record<string, string>) => void;
  receiveOrder: (event: FormEvent<HTMLFormElement>, order: PurchaseOrder) => void; updateOrderStatus: (order: PurchaseOrder, status: string) => void;
}) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-emerald-700" /><h2 className="text-lg font-extrabold">Purchase orders</h2></div>
    {orders.length ? <div className="mt-3 space-y-3">{orders.map((order) => {
      const items = orderItems.filter((item) => item.order_id === order.id);
      return <article key={order.id} className="rounded-xl border border-slate-200 p-3 md:p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-extrabold">Order {order.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs text-slate-500">{dateTime(order.order_date)} · {items.length} medicine line{items.length === 1 ? "" : "s"}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[order.status] || "bg-slate-100 text-slate-700"}`}>{statusLabel(order.status)}</span><span className="font-extrabold">{money(order.total_amount)}</span></div></div>
        {order.delivery_instructions && <p className="mt-2 text-sm text-slate-600"><Truck size={14} className="mr-1 inline" />{order.delivery_instructions}</p>}
        <div className="mt-3 divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">{items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{medicineLabel(medicineById.get(item.medicine_id))} · {item.quantity_received}/{item.quantity_ordered} received</span><span className="text-slate-500">{money(item.unit_price)} each · {money(item.line_total)}</span></div>)}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {order.status === "pending" && <><button type="button" disabled={busy || !canManage} onClick={() => updateOrderStatus(order, "accepted")} className="min-h-9 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white disabled:opacity-50">Record supplier acceptance</button><button type="button" disabled={busy || !canManage} onClick={() => updateOrderStatus(order, "cancelled")} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 disabled:opacity-50">Cancel order</button></>}
          {order.status === "accepted" && <><button type="button" disabled={busy || !canManage} onClick={() => updateOrderStatus(order, "processing")} className="min-h-9 rounded-lg bg-indigo-700 px-3 text-xs font-bold text-white disabled:opacity-50">Record processing</button><button type="button" disabled={busy || !canManage} onClick={() => updateOrderStatus(order, "cancelled")} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 disabled:opacity-50">Cancel order</button></>}
          {order.status === "processing" && <><button type="button" disabled={busy || !canManage} onClick={() => updateOrderStatus(order, "dispatched")} className="min-h-9 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white disabled:opacity-50">Record dispatched</button><button type="button" disabled={busy || !canManage} onClick={() => updateOrderStatus(order, "cancelled")} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 disabled:opacity-50">Cancel order</button></>}
          {order.pharmacy_id === pharmacyId && !["received", "cancelled"].includes(order.status) && <button type="button" disabled={busy || !canManage} onClick={() => setOpenReceiptId(openReceiptId === order.id ? "" : order.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white disabled:opacity-50"><PackageCheck size={14} />{openReceiptId === order.id ? "Close receipt" : "Record goods receipt"}</button>}
        </div>
        {openReceiptId === order.id && <form onSubmit={(event) => receiveOrder(event, order)} className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"><h3 className="font-extrabold">Confirm received goods</h3><p className="mt-1 text-xs text-slate-600">Enter actual quantities. Expired batches are rejected; receipt updates stock and history atomically.</p>
          <div className="mt-3 space-y-3">{items.filter((item) => item.quantity_received < item.quantity_ordered).map((item) => {
            const draft = receiptDrafts[item.id] || { ...emptyReceiptDraft(), selling: String(inventoryPrices.find((row) => row.medicine_id === item.medicine_id)?.selling_price ?? "") };
            const setField = (key: keyof ReceiptDraft, value: string) => setReceiptDrafts((current) => ({ ...current, [item.id]: { ...draft, [key]: value } }));
            return <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{medicineLabel(medicineById.get(item.medicine_id))}</strong><span className="text-xs text-slate-500">{item.quantity_ordered - item.quantity_received} units outstanding · cost {money(item.unit_price)}</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><ReceiptInput label="Received quantity" type="number" min="0" max={String(item.quantity_ordered - item.quantity_received)} value={draft.quantity} onChange={(value) => setField("quantity", value)} /><ReceiptInput label="Batch number" value={draft.batch} onChange={(value) => setField("batch", value)} /><ReceiptInput label="Expiry date" type="date" min={new Date().toISOString().slice(0, 10)} value={draft.expiry} onChange={(value) => setField("expiry", value)} /><ReceiptInput label="Manufactured (optional)" type="date" max={new Date().toISOString().slice(0, 10)} value={draft.manufactured} onChange={(value) => setField("manufactured", value)} /><ReceiptInput label="Selling price / unit" type="number" min="0" step="0.01" value={draft.selling} onChange={(value) => setField("selling", value)} /></div></div>;
          })}</div><label className="mt-3 block text-sm font-bold">Receipt notes<textarea rows={2} maxLength={1000} value={receiptNotes[order.id] || ""} onChange={(event) => setReceiptNotes((current) => ({ ...current, [order.id]: event.target.value }))} className={fieldClass} /></label><button type="submit" disabled={busy || !canManage} className="mt-3 min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Recording receipt…" : "Confirm goods receipt"}</button>
        </form>}
      </article>;
    })}</div> : <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-7 text-center"><ClipboardList className="mx-auto text-slate-400" /><p className="mt-2 font-bold">No purchase orders for this supplier yet</p><p className="mt-1 text-sm text-slate-500">Orders placed by this pharmacy will appear here.</p></div>}
  </section>;
}

function emptyReceiptDraft(): ReceiptDraft { return { quantity: "", batch: "", expiry: "", manufactured: "", selling: "" }; }

function ReceiptInput({ label, type = "text", min, max, step, value, onChange }: { label: string; type?: string; min?: string; max?: string; step?: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold text-slate-600">{label}<input type={type} min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm font-normal" /></label>;
}

function Info({ label, value, link }: { label: string; value: string; link?: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>{link ? <a href={link} className="mt-1 block break-words text-sm font-semibold text-emerald-800 hover:underline">{value}</a> : <p className="mt-1 break-words text-sm font-semibold">{value}</p>}</div>;
}

function AlertBox({ kind, text, onClose }: { kind: "error" | "success"; text: string; onClose: () => void }) {
  const error = kind === "error";
  return <div role={error ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ? <CircleAlert size={17} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0" />}{text}<button type="button" className="ml-auto" aria-label="Dismiss message" onClick={onClose}><X size={16} /></button></div>;
}

function medicineLabel(medicine: Medicine | undefined) {
  if (!medicine) return "Medicine";
  const detail = [medicine.strength, medicine.dosage_form, medicine.pack_size].filter(Boolean).join(" · ");
  return [medicine.name, detail].filter(Boolean).join(" · ");
}
