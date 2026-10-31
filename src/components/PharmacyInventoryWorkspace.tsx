import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpDown,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileDown,
  PackageCheck,
  Search,
  ShieldAlert,
  Upload,
} from "lucide-react";
import InventoryOperations from "@/components/InventoryOperations";
import { requireSupabase } from "@/lib/supabase";

export type InventorySection =
  | "overview"
  | "medicines"
  | "purchase"
  | "batches"
  | "low-stock"
  | "expiry"
  | "history"
  | "import-export";

export type InventoryMedicine = {
  medicine_id: string;
  medicine_name: string;
  generic_name?: string | null;
  brand_name?: string | null;
  category?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  pack_size?: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  average_purchase_cost: number;
  selling_price: number;
  nearest_expiry?: string | null;
  is_low_stock?: boolean;
};

export type InventoryBatch = {
  id: string;
  medicine_id: string;
  batch_number: string;
  expiry_date: string | null;
  manufacturing_date: string | null;
  quantity_received: number;
  quantity_remaining: number;
  purchase_cost_per_unit: number;
  selling_price_per_unit: number;
  supplier_name: string | null;
  received_at: string;
  stock_status: "available" | "quarantined" | "recalled";
};

export type InventoryPurchase = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  purchased_at: string;
  total_cost: number;
  notes: string | null;
};

export type InventoryMovement = {
  id: string;
  medicine_id: string;
  batch_id: string | null;
  movement_type: string;
  quantity_change: number;
  unit_cost: number | null;
  unit_selling_price: number | null;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateText = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString() : "—";
const dateTimeText = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "—";
const expiryDays = (value: string | null | undefined) => {
  if (!value) return null;
  const expiry = new Date(`${value.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
};

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(name: string, rows: unknown[][]) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((part) => part.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((part) => part.trim())) rows.push(row);
  return rows;
}

function medicineKey(row: Pick<InventoryMedicine, "medicine_name" | "strength" | "dosage_form" | "pack_size">) {
  return [row.medicine_name, row.strength, row.dosage_form, row.pack_size]
    .map((part) => (part || "").trim().toLocaleLowerCase())
    .join("|");
}

function stockAvailable(medicine: InventoryMedicine, batches: InventoryBatch[]) {
  const medicineBatches = batches.filter((batch) => batch.medicine_id === medicine.medicine_id);
  if (medicineBatches.length === 0) return Number(medicine.quantity_on_hand || 0);
  return medicineBatches.reduce((total, batch) => {
    const days = expiryDays(batch.expiry_date);
    return total + (batch.stock_status === "available" && (days === null || days >= 0) ? Number(batch.quantity_remaining || 0) : 0);
  }, 0);
}

function medicineStatus(medicine: InventoryMedicine, batches: InventoryBatch[]) {
  const available = stockAvailable(medicine, batches);
  if (available <= 0) return { label: "Out of stock", style: "bg-rose-50 text-rose-700" };
  if (available <= Number(medicine.reorder_level || 0)) return { label: "Low stock", style: "bg-amber-50 text-amber-800" };
  const nextExpiry = batches
    .filter((batch) => batch.medicine_id === medicine.medicine_id && batch.stock_status === "available" && batch.quantity_remaining > 0)
    .map((batch) => expiryDays(batch.expiry_date))
    .filter((days): days is number => days !== null && days >= 0)
    .sort((a, b) => a - b)[0];
  if (nextExpiry !== undefined && nextExpiry <= 90) return { label: "Expiring soon", style: "bg-orange-50 text-orange-800" };
  return { label: "In stock", style: "bg-emerald-50 text-emerald-800" };
}

export default function PharmacyInventoryWorkspace({
  pharmacyId,
  inventory,
  batches,
  purchases,
  movements,
  section,
  canManage,
  onNavigate,
  onCreateDistributorOrder,
  onReload,
  onLoadMoreMovements,
  hasMoreMovements,
}: {
  pharmacyId: string;
  inventory: InventoryMedicine[];
  batches: InventoryBatch[];
  purchases: InventoryPurchase[];
  movements: InventoryMovement[];
  section: InventorySection;
  canManage: boolean;
  onNavigate: (section: InventorySection) => void;
  onCreateDistributorOrder: (medicineId: string, quantity: number) => void;
  onReload: () => Promise<void>;
  onLoadMoreMovements: () => Promise<void>;
  hasMoreMovements: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "quantity" | "price">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [selectedMedicine, setSelectedMedicine] = useState<InventoryMedicine | null>(null);
  const [editingMedicine, setEditingMedicine] = useState<InventoryMedicine | null>(null);
  const [adjustmentBatch, setAdjustmentBatch] = useState<InventoryBatch | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [expiryFilter, setExpiryFilter] = useState<"all" | "7" | "30" | "90" | "expired">("all");
  const [historyType, setHistoryType] = useState("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const pageSize = 10;

  const medicineById = useMemo(() => new Map(inventory.map((item) => [item.medicine_id, item])), [inventory]);
  const purchaseById = useMemo(() => new Map(purchases.map((item) => [item.id, item])), [purchases]);
  const categories = useMemo(() => [...new Set(inventory.map((item) => item.category?.trim()).filter((item): item is string => Boolean(item)))].sort(), [inventory]);
  const totalAvailable = inventory.reduce((sum, item) => sum + stockAvailable(item, batches), 0);
  const lowStock = inventory.filter((item) => stockAvailable(item, batches) <= Number(item.reorder_level || 0));
  const outOfStock = inventory.filter((item) => stockAvailable(item, batches) <= 0);
  const expiredMedicineIds = new Set(batches.filter((batch) => batch.quantity_remaining > 0 && (expiryDays(batch.expiry_date) ?? 0) < 0).map((batch) => batch.medicine_id));
  const nearExpiryMedicineIds = new Set(batches.filter((batch) => {
    const days = expiryDays(batch.expiry_date);
    return batch.quantity_remaining > 0 && batch.stock_status === "available" && days !== null && days >= 0 && days <= 90;
  }).map((batch) => batch.medicine_id));
  const recentPurchases = [...purchases].sort((a, b) => b.purchased_at.localeCompare(a.purchased_at)).slice(0, 5);
  const recentMovements = movements.slice(0, 5);
  const operationsInventory = useMemo(() => inventory.map((item) => ({
    ...item,
    quantity_on_hand: stockAvailable(item, batches),
  })), [inventory, batches]);

  const filteredMedicines = useMemo(() => inventory
    .filter((item) => {
      const needle = search.trim().toLocaleLowerCase();
      const matchesSearch = !needle || [item.medicine_name, item.generic_name, item.brand_name]
        .some((text) => (text || "").toLocaleLowerCase().includes(needle));
      const matchesCategory = category === "all" || item.category === category;
      const available = stockAvailable(item, batches);
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "out" && available <= 0)
        || (statusFilter === "low" && available > 0 && available <= Number(item.reorder_level || 0))
        || (statusFilter === "in" && available > Number(item.reorder_level || 0));
      return matchesSearch && matchesCategory && matchesStatus;
    })
    .sort((a, b) => {
      const factor = sortDirection === "asc" ? 1 : -1;
      if (sortBy === "quantity") return (stockAvailable(a, batches) - stockAvailable(b, batches)) * factor;
      if (sortBy === "price") return (Number(a.selling_price) - Number(b.selling_price)) * factor;
      return a.medicine_name.localeCompare(b.medicine_name) * factor;
    }), [inventory, batches, search, category, statusFilter, sortBy, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(filteredMedicines.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageMedicines = filteredMedicines.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [search, category, statusFilter, sortBy, sortDirection]);

  async function setBatchStatus(batch: InventoryBatch, nextStatus: InventoryBatch["stock_status"]) {
    if (!canManage) return;
    try {
      const { error } = await requireSupabase().rpc("set_pharmacy_batch_status", {
        p_pharmacy_id: pharmacyId,
        p_batch_id: batch.id,
        p_status: nextStatus,
        p_note: "Updated from pharmacy inventory workspace",
      });
      if (error) throw error;
      setNotice({ kind: "success", text: `Batch ${batch.batch_number} marked ${nextStatus}.` });
      await onReload();
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "Could not update the batch." });
    }
  }

  const exportInventory = () => downloadCsv("pharmacy-inventory.csv", [
    ["medicine_name", "generic_name", "brand_name", "category", "strength", "dosage_form", "pack_size", "available_quantity", "reorder_level", "selling_price", "stock_status"],
    ...inventory.map((item) => [item.medicine_name, item.generic_name, item.brand_name, item.category, item.strength, item.dosage_form, item.pack_size, stockAvailable(item, batches), item.reorder_level, item.selling_price, medicineStatus(item, batches).label]),
  ]);

  return (
    <div className="space-y-5">
      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
          <button type="button" onClick={() => setNotice(null)} className="ml-3 font-bold underline">Dismiss</button>
        </p>
      )}

      {section === "overview" && (
        <Overview
          inventory={inventory}
          batches={batches}
          lowCount={lowStock.length}
          outCount={outOfStock.length}
          expiredCount={expiredMedicineIds.size}
          nearExpiryCount={nearExpiryMedicineIds.size}
          totalAvailable={totalAvailable}
          purchases={recentPurchases}
          movements={recentMovements}
          medicineById={medicineById}
          purchaseById={purchaseById}
          onNavigate={onNavigate}
        />
      )}

      {section === "medicines" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold">Medicine catalogue</h2>
              <p className="mt-1 text-sm text-slate-500">Search, filter, sort, and review medicines stocked by this pharmacy.</p>
            </div>
            <button type="button" onClick={() => onNavigate("import-export")} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Import or export
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative text-xs font-bold text-slate-500">Search medicine, generic, or brand
              <Search size={16} className="absolute bottom-3 left-3 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-normal text-slate-900 outline-none focus:border-emerald-500" placeholder="Medicine name" />
            </label>
            <label className="text-xs font-bold text-slate-500">Category
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900">
                <option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-500">Stock status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900">
                <option value="all">All statuses</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-500">Sort by
              <span className="mt-1 flex gap-2">
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900">
                  <option value="name">Medicine name</option><option value="quantity">Quantity</option><option value="price">Price</option>
                </select>
                <button type="button" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")} aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`} className="grid min-h-11 w-11 place-items-center rounded-lg border border-slate-200 text-slate-600"><ArrowUpDown size={16} /></button>
              </span>
            </label>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Medicine", "Generic / brand", "Strength / form", "Pack", "Available", "Reorder", "Selling price", "Status", "Details"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
              <tbody>
                {pageMedicines.map((item) => {
                  const available = stockAvailable(item, batches);
                  const badge = medicineStatus(item, batches);
                  return <tr key={item.medicine_id} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-bold">{item.medicine_name}{item.category && <span className="block text-xs font-normal text-slate-500">{item.category}</span>}</td>
                    <td className="px-3 py-3">{item.generic_name || "—"}<span className="block text-xs text-slate-500">{item.brand_name || "—"}</span></td>
                    <td className="px-3 py-3">{item.strength || "—"}<span className="block text-xs text-slate-500">{item.dosage_form || "—"}</span></td>
                    <td className="px-3 py-3">{item.pack_size || "—"}</td>
                    <td className="px-3 py-3 font-bold">{available}</td>
                    <td className="px-3 py-3">{item.reorder_level}</td>
                    <td className="px-3 py-3">{money(item.selling_price)}</td>
                    <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${badge.style}`}>{badge.label}</span></td>
                    <td className="px-3 py-3"><button type="button" onClick={() => setSelectedMedicine(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">View</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
            {filteredMedicines.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No medicines match these filters.</p>}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>Showing {filteredMedicines.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredMedicines.length)} of {filteredMedicines.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={17} /></button>
              <span>Page {currentPage} of {pageCount}</span>
              <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 disabled:opacity-40" aria-label="Next page"><ChevronRight size={17} /></button>
            </div>
          </div>
        </section>
      )}

      {section === "purchase" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-bold">Receive stock here</p>
            <p className="mt-1">A confirmed purchase records the receipt, batch, invoice, and stock movement together. Creating an order alone does not change stock.</p>
          </div>
          <InventoryOperations pharmacyId={pharmacyId} inventory={operationsInventory} onSaved={onReload} canManage={canManage} initialAction="purchase" />
        </div>
      )}

      {section === "batches" && (
        <BatchTable batches={batches} medicineById={medicineById} canManage={canManage} onStatus={setBatchStatus} onAdjust={setAdjustmentBatch} />
      )}

      {section === "low-stock" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><AlertTriangle size={19} /></div><div><h2 className="font-extrabold">Low stock medicines</h2><p className="text-sm text-slate-500">Stock at or below the configured reorder level.</p></div></div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Medicine", "Current stock", "Reorder level", "Suggested quantity", "Last purchase", "Action"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
              <tbody>{lowStock.map((item) => {
                const available = stockAvailable(item, batches);
                const lastPurchase = [...purchases].filter((purchase) => movements.some((movement) => movement.reference_id === purchase.id && movement.medicine_id === item.medicine_id)).sort((a, b) => b.purchased_at.localeCompare(a.purchased_at))[0];
                const target = Math.max(Number(item.reorder_level) * 3, Number(item.reorder_level) + 1);
                return <tr key={item.medicine_id} className="border-t border-slate-100"><td className="px-3 py-3 font-bold">{item.medicine_name}</td><td className="px-3 py-3">{available}</td><td className="px-3 py-3">{item.reorder_level}</td><td className="px-3 py-3 font-semibold">{Math.max(1, target - available)}</td><td className="px-3 py-3">{lastPurchase ? dateText(lastPurchase.purchased_at) : "—"}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => onCreateDistributorOrder(item.medicine_id, Math.max(1, target - available))} disabled={!canManage} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Find distributor</button><button type="button" onClick={() => onNavigate("purchase")} disabled={!canManage} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Manual receipt</button></div></td></tr>;
              })}</tbody>
            </table>
            {lowStock.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No medicines are at or below their reorder level.</p>}
          </div>
          <p className="mt-3 text-xs text-slate-500">Suggested quantity targets three times the reorder level (minimum one unit). Review and edit it before submitting a distributor order.</p>
        </section>
      )}

      {section === "expiry" && (
        <ExpiryTable
          batches={batches}
          medicineById={medicineById}
          filter={expiryFilter}
          onFilter={setExpiryFilter}
          canManage={canManage}
          onStatus={setBatchStatus}
          onAdjust={setAdjustmentBatch}
        />
      )}

      {section === "history" && (
        <HistoryTable
          movements={movements}
          medicineById={medicineById}
          batches={batches}
          purchaseById={purchaseById}
          query={search}
          onQuery={setSearch}
          type={historyType}
          onType={setHistoryType}
          dateFrom={historyFrom}
          onDateFrom={setHistoryFrom}
          dateTo={historyTo}
          onDateTo={setHistoryTo}
          onLoadMore={onLoadMoreMovements}
          hasMore={hasMoreMovements}
        />
      )}

      {section === "import-export" && (
        <ImportExport
          pharmacyId={pharmacyId}
          inventory={inventory}
          canManage={canManage}
          onExport={exportInventory}
          onDone={onReload}
          onNotice={setNotice}
        />
      )}

      {selectedMedicine && (
        <MedicineDetails
          medicine={selectedMedicine}
          availableQuantity={stockAvailable(selectedMedicine, batches)}
          batches={batches.filter((batch) => batch.medicine_id === selectedMedicine.medicine_id)}
          canManage={canManage}
          onClose={() => setSelectedMedicine(null)}
          onEdit={() => { setEditingMedicine(selectedMedicine); setSelectedMedicine(null); }}
        />
      )}
      {editingMedicine && (
        <EditMedicineDialog
          pharmacyId={pharmacyId}
          medicine={editingMedicine}
          onClose={() => setEditingMedicine(null)}
          onSaved={async () => { setEditingMedicine(null); setNotice({ kind: "success", text: "Medicine stock settings updated." }); await onReload(); }}
          onError={(text) => setNotice({ kind: "error", text })}
        />
      )}
      {adjustmentBatch && (
        <AdjustmentDialog
          pharmacyId={pharmacyId}
          batch={adjustmentBatch}
          medicineName={medicineById.get(adjustmentBatch.medicine_id)?.medicine_name || "Medicine"}
          onClose={() => setAdjustmentBatch(null)}
          onSaved={async () => { setAdjustmentBatch(null); setNotice({ kind: "success", text: "Stock adjustment saved to history." }); await onReload(); }}
          onError={(text) => setNotice({ kind: "error", text })}
        />
      )}
    </div>
  );
}

function Overview({
  inventory, batches, lowCount, outCount, expiredCount, nearExpiryCount, totalAvailable,
  purchases, movements, medicineById, purchaseById, onNavigate,
}: {
  inventory: InventoryMedicine[];
  batches: InventoryBatch[];
  lowCount: number;
  outCount: number;
  expiredCount: number;
  nearExpiryCount: number;
  totalAvailable: number;
  purchases: InventoryPurchase[];
  movements: InventoryMovement[];
  medicineById: Map<string, InventoryMedicine>;
  purchaseById: Map<string, InventoryPurchase>;
  onNavigate: (section: InventorySection) => void;
}) {
  const cards: Array<[string, string | number, string, string]> = [
    ["Medicines", inventory.length, "In this pharmacy catalogue", "text-slate-900"],
    ["Available stock", totalAvailable.toLocaleString("en-IN"), "Eligible, non-expired units", "text-emerald-800"],
    ["Low stock", lowCount, "At or below reorder level", "text-amber-800"],
    ["Out of stock", outCount, "No eligible units available", "text-rose-800"],
    ["Expired medicines", expiredCount, "Have expired batches remaining", "text-rose-800"],
    ["Nearing expiry", nearExpiryCount, "Within the next 90 days", "text-orange-800"],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, detail, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-2 text-3xl font-extrabold ${color}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onNavigate("purchase")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800"><PackageCheck size={17} /> Add medicine / receive stock</button>
        <button type="button" onClick={() => onNavigate("low-stock")} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Review low stock</button>
        <button type="button" onClick={() => onNavigate("expiry")} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Manage expiry</button>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2"><div><h2 className="font-extrabold">Recent purchases</h2><p className="mt-1 text-xs text-slate-500">Confirmed receipts that updated stock.</p></div><button type="button" onClick={() => onNavigate("history")} className="text-xs font-bold text-emerald-800">Stock history</button></div>
          <div className="mt-3 divide-y divide-slate-100">{purchases.map((purchase) => <div key={purchase.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-bold">{purchase.supplier_name || "Supplier not provided"}</p><p className="text-xs text-slate-500">{purchase.invoice_number ? `Invoice ${purchase.invoice_number}` : `Purchase ${purchase.id.slice(0, 8)}`} · {dateTimeText(purchase.purchased_at)}</p></div><span className="shrink-0 font-bold">{money(purchase.total_cost)}</span></div>)}{purchases.length === 0 && <p className="py-7 text-center text-sm text-slate-500">No purchase receipts recorded yet.</p>}</div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2"><div><h2 className="font-extrabold">Recent stock updates</h2><p className="mt-1 text-xs text-slate-500">From the pharmacy stock movement log.</p></div><button type="button" onClick={() => onNavigate("history")} className="text-xs font-bold text-emerald-800">View all</button></div>
          <MovementList movements={movements} medicineById={medicineById} batches={batches} purchaseById={purchaseById} />
        </section>
      </div>
    </div>
  );
}

function BatchTable({ batches, medicineById, canManage, onStatus, onAdjust }: {
  batches: InventoryBatch[];
  medicineById: Map<string, InventoryMedicine>;
  canManage: boolean;
  onStatus: (batch: InventoryBatch, status: InventoryBatch["stock_status"]) => Promise<void>;
  onAdjust: (batch: InventoryBatch) => void;
}) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><PackageCheck size={19} /></div><div><h2 className="font-extrabold">Batch management</h2><p className="mt-1 text-sm text-slate-500">Batch receipt and remaining quantities are kept for audit. Sales use earliest expiry first.</p></div></div>
    {!canManage && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Batch controls are locked until this pharmacy is approved.</p>}
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100"><table className="w-full min-w-[1100px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Medicine", "Batch", "Received", "Remaining", "Purchase cost", "Selling price", "Manufactured", "Expiry", "Supplier", "Status", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
      <tbody>{batches.map((batch) => {
        const medicine = medicineById.get(batch.medicine_id);
        const days = expiryDays(batch.expiry_date);
        const label = days !== null && days < 0 ? "Expired" : batch.stock_status === "available" ? "Available" : batch.stock_status === "quarantined" ? "Quarantined" : "Recalled";
        const color = label === "Expired" || label === "Recalled" ? "bg-rose-50 text-rose-800" : label === "Quarantined" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800";
        return <tr key={batch.id} className="border-t border-slate-100"><td className="px-3 py-3 font-bold">{medicine?.medicine_name || "Unknown medicine"}</td><td className="px-3 py-3">{batch.batch_number}</td><td className="px-3 py-3">{batch.quantity_received}</td><td className="px-3 py-3 font-bold">{batch.quantity_remaining}</td><td className="px-3 py-3">{money(batch.purchase_cost_per_unit)}</td><td className="px-3 py-3">{money(batch.selling_price_per_unit)}</td><td className="px-3 py-3">{dateText(batch.manufacturing_date)}</td><td className={`px-3 py-3 ${days !== null && days <= 30 ? "font-bold text-rose-700" : ""}`}>{dateText(batch.expiry_date)}</td><td className="px-3 py-3">{batch.supplier_name || "—"}</td><td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${color}`}>{label}</span></td><td className="px-3 py-3"><div className="flex gap-1.5">{batch.quantity_remaining > 0 && batch.stock_status === "available" && <button type="button" disabled={!canManage || label === "Expired"} onClick={() => void onStatus(batch, "quarantined")} className="whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40">Quarantine</button>}{batch.quantity_remaining > 0 && batch.stock_status === "quarantined" && <button type="button" disabled={!canManage || label === "Expired"} onClick={() => void onStatus(batch, "available")} className="whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40">Release</button>}{batch.quantity_remaining > 0 && batch.stock_status !== "recalled" && <button type="button" disabled={!canManage} onClick={() => void onStatus(batch, "recalled")} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-40">Recall</button>}{batch.quantity_remaining > 0 && <button type="button" disabled={!canManage} onClick={() => onAdjust(batch)} className="whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">Write off</button>}</div></td></tr>;
      })}</tbody>
    </table>{batches.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No batches have been received yet. Record a purchase receipt to create the first batch.</p>}</div>
  </section>;
}

function ExpiryTable({ batches, medicineById, filter, onFilter, canManage, onStatus, onAdjust }: {
  batches: InventoryBatch[];
  medicineById: Map<string, InventoryMedicine>;
  filter: "all" | "7" | "30" | "90" | "expired";
  onFilter: (value: "all" | "7" | "30" | "90" | "expired") => void;
  canManage: boolean;
  onStatus: (batch: InventoryBatch, status: InventoryBatch["stock_status"]) => Promise<void>;
  onAdjust: (batch: InventoryBatch) => void;
}) {
  const rows = batches.filter((batch) => {
    if (batch.quantity_remaining <= 0 || !batch.expiry_date) return false;
    const days = expiryDays(batch.expiry_date);
    if (days === null) return false;
    if (filter === "expired") return days < 0;
    if (filter !== "all") return days >= 0 && days <= Number(filter);
    return true;
  }).sort((a, b) => (a.expiry_date || "").localeCompare(b.expiry_date || ""));
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-800"><CalendarClock size={19} /></div><div><h2 className="font-extrabold">Expiry management</h2><p className="mt-1 text-sm text-slate-500">Expired batches cannot be sold. Quarantine or write off remaining stock.</p></div></div><label className="text-xs font-bold text-slate-500">Show batches<select value={filter} onChange={(event) => onFilter(event.target.value as typeof filter)} className="mt-1 block min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"><option value="7">Expiring within 7 days</option><option value="30">Expiring within 30 days</option><option value="90">Expiring within 90 days</option><option value="expired">Already expired</option><option value="all">All expiry records</option></select></label></div>
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Medicine", "Batch", "Remaining", "Expiry date", "Supplier", "Warning", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody>{rows.map((batch) => {
      const days = expiryDays(batch.expiry_date);
      const expired = days !== null && days < 0;
      const medicine = medicineById.get(batch.medicine_id);
      return <tr key={batch.id} className="border-t border-slate-100"><td className="px-3 py-3 font-bold">{medicine?.medicine_name || "Unknown medicine"}</td><td className="px-3 py-3">{batch.batch_number}</td><td className="px-3 py-3 font-bold">{batch.quantity_remaining}</td><td className={`px-3 py-3 ${expired || (days !== null && days <= 7) ? "font-bold text-rose-700" : ""}`}>{dateText(batch.expiry_date)}</td><td className="px-3 py-3">{batch.supplier_name || "—"}</td><td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${expired ? "bg-rose-50 text-rose-800" : days !== null && days <= 7 ? "bg-amber-50 text-amber-800" : "bg-orange-50 text-orange-800"}`}><ShieldAlert size={13} />{expired ? "Expired" : `${days} days left`}</span></td><td className="px-3 py-3"><div className="flex gap-1.5">{batch.stock_status === "available" && <button type="button" disabled={!canManage} onClick={() => void onStatus(batch, "quarantined")} className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-bold text-amber-800 disabled:opacity-40">Quarantine</button>}{batch.quantity_remaining > 0 && <button type="button" disabled={!canManage} onClick={() => onAdjust(batch)} className="whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">Record write-off</button>}</div></td></tr>;
    })}</tbody></table>{rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No batches match this expiry filter.</p>}</div>
    {!canManage && <p className="mt-3 text-sm text-amber-800">Quarantine and write-off actions unlock after pharmacy approval.</p>}
  </section>;
}

function HistoryTable({ movements, medicineById, batches, purchaseById, query, onQuery, type, onType, dateFrom, onDateFrom, dateTo, onDateTo, onLoadMore, hasMore }: {
  movements: InventoryMovement[];
  medicineById: Map<string, InventoryMedicine>;
  batches: InventoryBatch[];
  purchaseById: Map<string, InventoryPurchase>;
  query: string;
  onQuery: (value: string) => void;
  type: string;
  onType: (value: string) => void;
  dateFrom: string;
  onDateFrom: (value: string) => void;
  dateTo: string;
  onDateTo: (value: string) => void;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
}) {
  const [loadingOlder, setLoadingOlder] = useState(false);
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const rows = movements.filter((movement) => {
    const medicineName = medicineById.get(movement.medicine_id)?.medicine_name || "";
    return (!query || medicineName.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      && (type === "all" || movement.movement_type === type)
      && (!dateFrom || movement.created_at.slice(0, 10) >= dateFrom)
      && (!dateTo || movement.created_at.slice(0, 10) <= dateTo);
  });
  const types = [...new Set(movements.map((movement) => movement.movement_type))].sort();
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-extrabold">Stock history</h2><p className="mt-1 text-sm text-slate-500">Append-only stock movements recorded by secure database operations.</p></div><span className="text-xs text-slate-500">Most recent {movements.length} movements loaded</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-bold text-slate-500">Search medicine<input value={query} onChange={(event) => onQuery(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900" placeholder="Medicine name" /></label><label className="text-xs font-bold text-slate-500">Movement type<select value={type} onChange={(event) => onType(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900"><option value="all">All types</option>{types.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-bold text-slate-500">From<input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900" /></label><label className="text-xs font-bold text-slate-500">To<input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900" /></label></div>
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Date / time", "Medicine", "Batch", "Type", "Quantity change", "Previous / resulting", "Reference", "User", "Note"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody>{rows.map((movement) => {
      const purchase = movement.reference_id ? purchaseById.get(movement.reference_id) : undefined;
      const batch = movement.batch_id ? batchById.get(movement.batch_id) : undefined;
      const reference = purchase?.invoice_number ? `Invoice ${purchase.invoice_number}` : movement.reference_id ? `${movement.reference_type || "Record"} ${movement.reference_id.slice(0, 8)}` : movement.reference_type || "—";
      return <tr key={movement.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-3">{dateTimeText(movement.created_at)}</td><td className="px-3 py-3 font-bold">{medicineById.get(movement.medicine_id)?.medicine_name || "Medicine unavailable"}</td><td className="px-3 py-3">{batch?.batch_number || "—"}</td><td className="px-3 py-3 capitalize">{movement.movement_type.replace(/_/g, " ")}</td><td className={`px-3 py-3 font-bold ${movement.quantity_change < 0 ? "text-rose-700" : movement.quantity_change > 0 ? "text-emerald-700" : "text-slate-500"}`}>{movement.quantity_change > 0 ? "+" : ""}{movement.quantity_change}</td><td className="px-3 py-3 text-slate-400">—</td><td className="px-3 py-3">{reference}</td><td className="px-3 py-3">{movement.created_by ? movement.created_by.slice(0, 8) : "System"}</td><td className="max-w-52 truncate px-3 py-3" title={movement.note || ""}>{movement.note || "—"}</td></tr>;
    })}</tbody></table>{rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No stock movements match these filters.</p>}</div>
    {hasMore && <button type="button" disabled={loadingOlder} onClick={async () => { setLoadingOlder(true); await onLoadMore(); setLoadingOlder(false); }} className="mt-3 min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 disabled:opacity-50">{loadingOlder ? "Loading…" : "Load older entries"}</button>}
    <p className="mt-3 text-xs text-slate-500">The current schema does not store before/after balances or user display names. User IDs are shortened here; batch and invoice references are shown when recorded.</p>
  </section>;
}

function MovementList({ movements, medicineById, batches, purchaseById }: {
  movements: InventoryMovement[];
  medicineById: Map<string, InventoryMedicine>;
  batches: InventoryBatch[];
  purchaseById: Map<string, InventoryPurchase>;
}) {
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  return <div className="mt-3 divide-y divide-slate-100">{movements.map((movement) => {
    const purchase = movement.reference_id ? purchaseById.get(movement.reference_id) : undefined;
    const batch = movement.batch_id ? batchById.get(movement.batch_id) : undefined;
    return <div key={movement.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="truncate font-bold">{medicineById.get(movement.medicine_id)?.medicine_name || "Medicine"}{batch ? ` · ${batch.batch_number}` : ""}</p><p className="text-xs capitalize text-slate-500">{movement.movement_type.replace(/_/g, " ")} · {dateTimeText(movement.created_at)}{purchase?.invoice_number ? ` · Invoice ${purchase.invoice_number}` : ""}</p></div><span className={`shrink-0 font-extrabold ${movement.quantity_change < 0 ? "text-rose-700" : "text-emerald-700"}`}>{movement.quantity_change > 0 ? "+" : ""}{movement.quantity_change}</span></div>;
  })}{movements.length === 0 && <p className="py-7 text-center text-sm text-slate-500">No stock changes recorded yet.</p>}</div>;
}

function MedicineDetails({ medicine, availableQuantity, batches, canManage, onClose, onEdit }: {
  medicine: InventoryMedicine;
  availableQuantity: number;
  batches: InventoryBatch[];
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return <Modal title={`${medicine.medicine_name} details`} onClose={onClose}>
    <div className="grid gap-3 sm:grid-cols-2">{[
      ["Generic name", medicine.generic_name], ["Brand", medicine.brand_name], ["Category", medicine.category], ["Strength", medicine.strength], ["Dosage form", medicine.dosage_form], ["Pack size", medicine.pack_size], ["Available quantity", availableQuantity], ["Reorder level", medicine.reorder_level], ["Selling price", money(medicine.selling_price)], ["Average purchase cost", money(medicine.average_purchase_cost)],
    ].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold">{value || "—"}</p></div>)}</div>
    <div className="mt-4"><h3 className="text-sm font-extrabold">Recent batches</h3>{batches.length ? <div className="mt-2 space-y-2">{batches.slice(0, 5).map((batch) => <p key={batch.id} className="flex justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"><span>Batch {batch.batch_number} · expiry {dateText(batch.expiry_date)}</span><span className="font-bold">{batch.quantity_remaining} left</span></p>)}</div> : <p className="mt-2 text-sm text-slate-500">No batch receipt recorded.</p>}</div>
    <div className="mt-5 flex justify-end"><button type="button" disabled={!canManage} onClick={onEdit} className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">Edit price and reorder level</button></div>
  </Modal>;
}

function EditMedicineDialog({ pharmacyId, medicine, onClose, onSaved, onError }: {
  pharmacyId: string;
  medicine: InventoryMedicine;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const { error } = await requireSupabase().rpc("update_pharmacy_inventory_settings", {
        p_pharmacy_id: pharmacyId,
        p_medicine_id: medicine.medicine_id,
        p_reorder_level: Number(data.get("reorder_level")),
        p_selling_price: Number(data.get("selling_price")),
      });
      if (error) throw error;
      await onSaved();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not update medicine settings.");
    } finally { setBusy(false); }
  }
  return <Modal title={`Edit ${medicine.medicine_name}`} onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-4"><p className="text-sm text-slate-500">These values apply to this pharmacy only. Shared catalogue details stay unchanged.</p><label className="block text-sm font-bold text-slate-700">Reorder level<input type="number" min="0" step="1" name="reorder_level" required defaultValue={medicine.reorder_level} className={fieldClass} /></label><label className="block text-sm font-bold text-slate-700">Selling price per unit<input type="number" min="0" step="0.01" name="selling_price" required defaultValue={medicine.selling_price} className={fieldClass} /></label><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold">Cancel</button><button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save settings"}</button></div></form></Modal>;
}

function AdjustmentDialog({ pharmacyId, batch, medicineName, onClose, onSaved, onError }: {
  pharmacyId: string;
  batch: InventoryBatch;
  medicineName: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const expired = (expiryDays(batch.expiry_date) ?? 0) < 0;
  const defaultReason = expired ? "expired" : batch.stock_status === "recalled" ? "recall" : "damaged";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const { error } = await requireSupabase().rpc("record_pharmacy_batch_writeoff", {
        p_pharmacy_id: pharmacyId,
        p_batch_id: batch.id,
        p_quantity: Number(data.get("quantity")),
        p_reason: String(data.get("reason")),
        p_note: String(data.get("note") || "").trim() || null,
      });
      if (error) throw error;
      await onSaved();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not save the stock adjustment.");
    } finally { setBusy(false); }
  }
  return <Modal title="Record stock write-off" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-4"><p className="text-sm text-slate-600">{medicineName} · batch {batch.batch_number} · {batch.quantity_remaining} units remaining. This creates a permanent stock movement.</p><label className="block text-sm font-bold text-slate-700">Quantity to remove<input type="number" min="1" max={batch.quantity_remaining} step="1" name="quantity" required className={fieldClass} /></label><label className="block text-sm font-bold text-slate-700">Reason<select name="reason" defaultValue={defaultReason} className={fieldClass}><option value="expired">Expired</option><option value="damaged">Damaged</option><option value="recall">Recall</option></select></label><label className="block text-sm font-bold text-slate-700">Note<textarea name="note" rows={3} maxLength={500} className={fieldClass} placeholder="Optional details for the audit record" /></label><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold">Cancel</button><button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-slate-800 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Record write-off"}</button></div></form></Modal>;
}

type ImportRow = {
  row: number;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  category: string | null;
  strength: string | null;
  dosage_form: string | null;
  pack_size: string | null;
  reorder_level: number;
  selling_price: number;
  error: string | null;
};

function ImportExport({ pharmacyId, inventory, canManage, onExport, onDone, onNotice }: {
  pharmacyId: string;
  inventory: InventoryMedicine[];
  canManage: boolean;
  onExport: () => void;
  onDone: () => Promise<void>;
  onNotice: (notice: { kind: "success" | "error"; text: string } | null) => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setResult(""); setErrors([]); setRows([]); setShowPreview(false);
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) { setResult("The CSV needs a header row and at least one medicine row."); return; }
    const headers = parsed[0].map((header) => header.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, ""));
    const aliases: Record<string, string> = { medicine_name: "name", brand: "brand_name", generic: "generic_name", dosage: "dosage_form", pack: "pack_size" };
    const normalized = headers.map((header) => aliases[header] || header);
    if (normalized.some((header) => ["quantity", "quantity_on_hand", "stock", "available_quantity", "quantity_received"].includes(header))) {
      setResult("Stock quantity columns are not imported. Receive stock from Purchase / Add Stock so inventory and audit history stay in sync.");
      return;
    }
    const allowed = new Set(["name", "generic_name", "brand_name", "category", "strength", "dosage_form", "pack_size", "reorder_level", "selling_price"]);
    const unsupported = [...new Set(normalized.filter((header) => header && !allowed.has(header)))];
    if (unsupported.length) { setResult(`Unsupported CSV column${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}. Use the downloadable template.`); return; }
    if (new Set(normalized).size !== normalized.length) { setResult("The CSV has duplicate column headings. Keep one column for each field."); return; }
    if (!normalized.includes("name")) { setResult("Required CSV column missing: name (or medicine_name)."); return; }
    const inventoryKeys = new Set(inventory.map((item) => medicineKey(item)));
    const seen = new Set<string>();
    const importedRows = parsed.slice(1).map((cells, index): ImportRow => {
      const cell = (key: string) => {
        const position = normalized.indexOf(key);
        return position < 0 ? "" : (cells[position] || "").trim();
      };
      const name = cell("name");
      const strength = cell("strength") || null;
      const dosage_form = cell("dosage_form") || null;
      const pack_size = cell("pack_size") || null;
      const reorderText = cell("reorder_level") || "10";
      const priceText = cell("selling_price") || "0";
      const reorder_level = Number(reorderText);
      const selling_price = Number(priceText);
      const key = medicineKey({ medicine_name: name, strength: strength || undefined, dosage_form: dosage_form || undefined, pack_size: pack_size || undefined });
      let rowError: string | null = null;
      if (!name) rowError = "Medicine name is required.";
      else if (!Number.isInteger(reorder_level) || reorder_level < 0) rowError = "Reorder level must be a non-negative whole number.";
      else if (!Number.isFinite(selling_price) || selling_price < 0) rowError = "Selling price must be a non-negative number.";
      else if (seen.has(key)) rowError = "Duplicate medicine in this CSV.";
      else if (inventoryKeys.has(key)) rowError = "This medicine is already in this pharmacy catalogue.";
      seen.add(key);
      return {
        row: index + 2,
        name,
        generic_name: cell("generic_name") || null,
        brand_name: cell("brand_name") || null,
        category: cell("category") || null,
        strength,
        dosage_form,
        pack_size,
        reorder_level,
        selling_price,
        error: rowError,
      };
    });
    setFileName(file.name);
    setRows(importedRows);
    setShowPreview(true);
  }

  async function importRows() {
    const valid = rows.filter((row) => !row.error);
    if (!canManage || !valid.length) return;
    setBusy(true); setErrors([]); setResult("");
    const failures: string[] = [];
    let added = 0;
    const db = requireSupabase();
    for (const row of valid) {
      try {
        const { error } = await db.rpc("add_pharmacy_medicine", {
          p_pharmacy_id: pharmacyId,
          p_name: row.name,
          p_generic_name: row.generic_name,
          p_brand_name: row.brand_name,
          p_category: row.category,
          p_strength: row.strength,
          p_dosage_form: row.dosage_form,
          p_pack_size: row.pack_size,
          p_reorder_level: row.reorder_level,
          p_selling_price: row.selling_price,
        });
        if (error) failures.push(`Row ${row.row} (${row.name}): ${error.message}`);
        else added += 1;
      } catch (cause) {
        failures.push(`Row ${row.row} (${row.name}): ${cause instanceof Error ? cause.message : "Import failed"}`);
      }
    }
    setBusy(false);
    setErrors(failures);
    setResult(`${added} medicine${added === 1 ? "" : "s"} imported with zero stock${failures.length ? `; ${failures.length} row${failures.length === 1 ? "" : "s"} failed` : ""}.`);
    if (added) await onDone();
    if (added) onNotice({ kind: "success", text: `${added} catalogue row${added === 1 ? "" : "s"} imported. Stock quantities remain unchanged.` });
    if (failures.length) onNotice({ kind: "error", text: `${failures.length} CSV row${failures.length === 1 ? "" : "s"} could not be imported; see row errors below.` });
  }

  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><FileDown size={19} /></div><div><h2 className="font-extrabold">Export inventory</h2><p className="mt-1 text-sm text-slate-500">Download this pharmacy’s catalogue and current eligible stock as CSV.</p></div></div>
      <button type="button" onClick={onExport} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800"><ArrowDownToLine size={17} /> Download inventory CSV</button>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-800"><Upload size={19} /></div><div><h2 className="font-extrabold">Import medicine catalogue</h2><p className="mt-1 text-sm text-slate-500">Imports catalogue fields only. Every new medicine starts at zero stock.</p></div></div>
      {!canManage && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Import is locked until pharmacy approval.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => downloadCsv("medicine-template.csv", [["name", "generic_name", "brand_name", "category", "strength", "dosage_form", "pack_size", "reorder_level", "selling_price"], ["Example medicine", "Generic name", "Brand", "Category", "500 mg", "tablet", "10 tablets", "10", "25"]])} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700">Download CSV template</button><label className={`inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 ${!canManage ? "pointer-events-none opacity-50" : ""}`}>Choose CSV<input type="file" accept=".csv,text/csv" disabled={!canManage || busy} onChange={(event) => void chooseFile(event.target.files?.[0])} className="sr-only" /></label></div>
      {fileName && <p className="mt-3 text-xs text-slate-500">Selected: {fileName}</p>}
      {result && <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{result}</p>}
      {showPreview && <div className="mt-4"><p className="text-sm font-bold">Preview · {rows.length} rows · {rows.filter((row) => !row.error).length} ready</p><div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-100"><table className="w-full min-w-[520px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>{["Row", "Medicine", "Strength", "Category", "Reorder", "Price", "Validation"].map((item) => <th key={item} className="px-2 py-2">{item}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.row} className="border-t border-slate-100"><td className="px-2 py-2">{row.row}</td><td className="px-2 py-2 font-bold">{row.name || "—"}</td><td className="px-2 py-2">{row.strength || "—"}</td><td className="px-2 py-2">{row.category || "—"}</td><td className="px-2 py-2">{row.reorder_level}</td><td className="px-2 py-2">{money(row.selling_price)}</td><td className={`px-2 py-2 ${row.error ? "font-semibold text-rose-700" : "text-emerald-700"}`}>{row.error || "Ready"}</td></tr>)}</tbody></table></div><p className="mt-2 text-xs text-slate-500">Existing medicine records are skipped. No stock or prices are overwritten. Add stock through a received purchase.</p><button type="button" disabled={busy || !canManage || !rows.some((row) => !row.error)} onClick={() => void importRows()} className="mt-3 min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Importing…" : `Import ${rows.filter((row) => !row.error).length} valid rows`}</button></div>}
      {errors.length > 0 && <div role="alert" className="mt-3 max-h-36 overflow-auto rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
    </section>
  </div>;
}

const fieldClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-500";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="mb-4 flex items-start justify-between gap-3"><h2 className="text-xl font-extrabold">{title}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close dialog">×</button></div>{children}</section></div>;
}
