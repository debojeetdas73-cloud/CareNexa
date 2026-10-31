import { useState } from "react";
import type { FormEvent } from "react";
import { requireSupabase } from "@/lib/supabase";

type InventoryMedicine = {
  medicine_id: string;
  medicine_name: string;
  quantity_on_hand: number;
  reorder_level: number;
  selling_price: number;
};

type Action = "add" | "purchase" | "sale";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

export default function InventoryOperations({
  pharmacyId,
  inventory,
  onSaved,
  canManage,
  initialAction = "add",
}: {
  pharmacyId: string;
  inventory: InventoryMedicine[];
  onSaved: () => Promise<void>;
  canManage: boolean;
  initialAction?: Action;
}) {
  const [action, setAction] = useState<Action>(initialAction);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const form = new FormData(event.currentTarget);
    const formElement = event.currentTarget;
    const numberValue = (key: string) => Number(form.get(key));
    const textValue = (key: string) => String(form.get(key) ?? "").trim();

    try {
      const db = requireSupabase();
      let successMessage: string;

      if (action === "add") {
        const { error: rpcError } = await db.rpc("add_pharmacy_medicine", {
          p_pharmacy_id: pharmacyId,
          p_name: textValue("name"),
          p_generic_name: textValue("generic_name") || null,
          p_brand_name: textValue("brand_name") || null,
          p_category: textValue("category") || null,
          p_strength: textValue("strength") || null,
          p_dosage_form: textValue("dosage_form") || null,
          p_pack_size: textValue("pack_size") || null,
          p_reorder_level: numberValue("reorder_level"),
          p_selling_price: numberValue("selling_price"),
        });
        if (rpcError) throw rpcError;
        successMessage = "Medicine added to your inventory with zero stock. Record a purchase to add quantities.";
      } else if (action === "purchase") {
        const { error: rpcError } = await db.rpc("record_pharmacy_purchase", {
          p_pharmacy_id: pharmacyId,
          p_medicine_id: textValue("medicine_id"),
          p_quantity: numberValue("quantity"),
          p_unit_cost: numberValue("unit_cost"),
          p_selling_price: numberValue("selling_price"),
          p_supplier_name: textValue("supplier_name") || null,
          p_invoice_number: textValue("invoice_number") || null,
          p_batch_number: textValue("batch_number") || null,
          p_expiry_date: textValue("expiry_date") || null,
          p_notes: textValue("notes") || null,
          p_manufacturing_date: textValue("manufacturing_date") || null,
        });
        if (rpcError) throw rpcError;
        successMessage = "Purchase recorded; inventory quantity, weighted cost, batch and stock history were updated.";
      } else {
        const { error: rpcError } = await db.rpc("record_pharmacy_manual_sale", {
          p_pharmacy_id: pharmacyId,
          p_medicine_id: textValue("medicine_id"),
          p_quantity: numberValue("quantity"),
          p_unit_selling_price: null,
          p_note: textValue("note") || null,
        });
        if (rpcError) throw rpcError;
        successMessage = "Manual sale recorded and stock was reduced.";
      }

      await onSaved();
      formElement.reset();
      setMessage(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this inventory operation.");
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: Action; label: string }> = [
    { id: "add", label: "Add medicine" },
    { id: "purchase", label: "Purchase entry" },
    { id: "sale", label: "Manual sale" },
  ];

  if (!canManage) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="font-extrabold">Inventory changes are locked</h2>
        <p className="mt-1">An administrator must approve and activate your pharmacy before you can add medicines, record purchases or record sales.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-extrabold">Inventory actions</h2>
        <p className="mt-1 text-sm text-slate-500">Changes save to the database and update stock history.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Inventory actions">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={action === tab.id}
            onClick={() => { setAction(tab.id); setMessage(""); setError(""); }}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${action === tab.id ? "bg-emerald-700 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      <form key={action} onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        {action === "add" && (
          <>
            <Field label="Medicine name" name="name" required />
            <Field label="Generic name" name="generic_name" />
            <Field label="Brand name" name="brand_name" />
            <Field label="Category" name="category" />
            <Field label="Strength (e.g. 500 mg)" name="strength" />
            <DosageFormField />
            <PackSizeField />
            <Field label="Reorder level" name="reorder_level" type="number" min="0" defaultValue="10" required />
            <Field label="Selling price per unit (₹)" name="selling_price" type="number" min="0" step="0.01" defaultValue="0" required />
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">If this medicine already exists in the shared catalogue, it will be linked to your pharmacy. New entries start with zero stock.</p>
          </>
        )}

        {action === "purchase" && (
          <>
            <MedicineSelect inventory={inventory} />
            <Field label="Quantity received" name="quantity" type="number" min="1" step="1" required />
            <Field label="Purchase cost per unit (₹)" name="unit_cost" type="number" min="0" step="0.01" required />
            <Field label="Selling price per unit (₹)" name="selling_price" type="number" min="0" step="0.01" required />
            <Field label="Supplier" name="supplier_name" />
            <Field label="Invoice number" name="invoice_number" />
            <Field label="Batch number (optional)" name="batch_number" />
            <Field label="Expiry date (optional)" name="expiry_date" type="date" />
            <Field label="Manufacturing date (optional)" name="manufacturing_date" type="date" />
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes
              <textarea name="notes" rows={2} className={inputClass} />
            </label>
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">A batch number will be generated if omitted. The purchase and stock movement are saved together.</p>
          </>
        )}

        {action === "sale" && (
          <>
            <MedicineSelect inventory={inventory} />
            <Field label="Quantity sold" name="quantity" type="number" min="1" step="1" required />
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Note (optional)
              <textarea name="note" rows={2} className={inputClass} placeholder="Cash sale, walk-in customer, receipt reference…" />
            </label>
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Sale quantity cannot exceed available stock. Batch quantities are reduced by earliest expiry first.</p>
          </>
        )}

        <button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50 sm:col-span-2">
          {busy ? "Saving…" : action === "add" ? "Add to inventory" : action === "purchase" ? "Record purchase" : "Record manual sale"}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  min,
  step,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">{label}
      <input name={name} type={type} required={required} min={min} step={step} defaultValue={defaultValue} placeholder={placeholder} className={inputClass} />
    </label>
  );
}

function DosageFormField() {
  return (
    <label className="text-sm font-medium text-slate-700">Dosage form or product type
      <input name="dosage_form" list="medicine-form-suggestions" placeholder="Choose or type a form" className={inputClass} />
      <datalist id="medicine-form-suggestions">
        {["tablet", "capsule", "syrup", "suspension", "oral solution", "drops", "eye drops", "ear drops", "injection", "cream", "ointment", "gel", "lotion", "powder", "sachet", "inhaler", "nebulizer solution", "nasal spray", "mouthwash", "suppository", "patch"].map((form) => <option key={form} value={form} />)}
      </datalist>
      <span className="mt-1 block text-xs font-normal text-slate-500">Choose a suggestion or enter another dosage form.</span>
    </label>
  );
}

function PackSizeField() {
  return (
    <label className="text-sm font-medium text-slate-700">Pack size / container
      <input name="pack_size" list="medicine-package-suggestions" placeholder="e.g. 10 capsules, 100 ml bottle, 1 tube" className={inputClass} />
      <datalist id="medicine-package-suggestions">
        {["bottle", "blister pack", "strip", "tube", "vial", "ampoule", "sachet", "box"].map((packageType) => <option key={packageType} value={packageType} />)}
      </datalist>
      <span className="mt-1 block text-xs font-normal text-slate-500">Include the amount or count, such as 100 ml bottle or 10 capsules.</span>
    </label>
  );
}

function MedicineSelect({ inventory }: { inventory: InventoryMedicine[] }) {
  return (
    <label className="text-sm font-medium text-slate-700">Medicine
      <select name="medicine_id" className={inputClass} required defaultValue="">
        <option value="" disabled>Select medicine</option>
        {inventory.map((item) => (
          <option key={item.medicine_id} value={item.medicine_id}>
            {item.medicine_name} ({item.quantity_on_hand} in stock)
          </option>
        ))}
      </select>
      {inventory.length === 0 && <span className="mt-1 block text-xs text-amber-700">Add a medicine before recording this operation.</span>}
    </label>
  );
}
