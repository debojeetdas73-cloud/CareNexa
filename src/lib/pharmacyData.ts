import { requireSupabase } from "@/lib/supabase";
import type { Pharmacy } from "@/data/pharmacies";
import type { Medicine } from "@/data/medicines";

type InventoryRow = {
  pharmacy_id: string;
  pharmacy_name: string;
  state: string;
  district: string;
  city: string;
  medicine_id: string;
  medicine_name: string;
  generic_name: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  selling_price: number;
  average_purchase_cost: number;
  nearest_expiry: string | null;
  brand_name: string | null;
  category: string | null;
  strength: string | null;
  dosage_form: string | null;
  pack_size: string | null;
  manufacturer: string | null;
  prescription_required: boolean;
};

type PharmacyRow = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  state: string;
  district: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  opening_time: string | null;
  closing_time: string | null;
  is_24_hours: boolean;
  is_active: boolean;
};

export type PharmacyWithInventory = Pharmacy & {
  state: string;
  district: string;
  city: string;
};

type MedicineCatalogueRow = {
  id: string;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  category: string | null;
  strength: string | null;
  dosage_form: string | null;
  pack_size: string | null;
  manufacturer: string | null;
  prescription_required: boolean;
  has_stock: boolean;
  matching_medicine_ids: string[];
};

type CustomerStockRow = {
  pharmacy_id: string;
  pharmacy_name: string;
  address: string;
  phone: string | null;
  city: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  opening_time: string | null;
  closing_time: string | null;
  is_24_hours: boolean;
  medicine_id: string;
  medicine_name: string;
  generic_name: string | null;
  brand_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  pack_size: string | null;
  quantity_on_hand: number;
};

function formatTime(value: string | null) {
  if (!value) return "Hours not provided";
  const [hh, mm] = value.split(":");
  const h = Number(hh);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${mm} ${suffix}`;
}

function getIndiaMinutesNow() {
  // Always evaluate pharmacy hours in India Standard Time, regardless of
  // the customer's device/browser timezone.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isOpen(row: PharmacyRow) {
  if (!row.is_active) return false;
  if (row.is_24_hours) return true;
  if (!row.opening_time || !row.closing_time) return false;

  const current = getIndiaMinutesNow();
  const [oh, om] = row.opening_time.split(":").map(Number);
  const [ch, cm] = row.closing_time.split(":").map(Number);
  const open = oh * 60 + om;
  const close = ch * 60 + cm;

  // Supports shops that close after midnight (for example, 18:00–02:00).
  return close < open
    ? current >= open || current < close
    : current >= open && current < close;
}

function toMedicine(row: InventoryRow): Medicine {
  return {
    id: row.medicine_id,
    name: row.medicine_name,
    genericName: row.generic_name ?? "",
    category: row.category ?? "",
    brandName: row.brand_name,
    manufacturer: row.manufacturer,
    strength: row.strength,
    dosageForm: row.dosage_form,
    packSize: row.pack_size,
    prescriptionRequired: row.prescription_required,
    quantityOnHand: Number(row.quantity_on_hand),
    sellingPrice: Number(row.selling_price),
    purchaseCost: Number(row.average_purchase_cost),
  };
}

function toPharmacy(row: PharmacyRow, inventory: InventoryRow[]): PharmacyWithInventory {
  const meds = inventory.map(toMedicine);
  const prices = meds.map(m => Number(m.sellingPrice ?? 0)).filter(n => n > 0);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  return {
    id: row.id,
    name: row.name,
    address: [row.address, row.city, row.district, row.state].filter(Boolean).join(", "),
    distance: "—",
    rating: 0,
    reviewCount: 0,
    phone: row.phone ?? "Not provided",
    openNow: isOpen(row),
    hours: row.is_24_hours ? "24 hours" : `${formatTime(row.opening_time)} – ${formatTime(row.closing_time)}`,
    availableMedicines: meds,
    priceRange: prices.length ? `₹${min} – ₹${max}` : "Prices not listed",
    lat: Number(row.latitude ?? 0),
    lng: Number(row.longitude ?? 0),
    state: row.state,
    district: row.district,
    city: row.city,
  };
}

export async function searchMedicineCatalogue(query: string): Promise<Medicine[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];

  const { data, error } = await requireSupabase().rpc("search_customer_medicine_catalogue", {
    p_query: normalized,
  });
  if (error) throw error;

  return ((data ?? []) as MedicineCatalogueRow[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      genericName: row.generic_name ?? "",
      category: row.category ?? "",
      brandName: row.brand_name,
      manufacturer: row.manufacturer,
      strength: row.strength,
      dosageForm: row.dosage_form,
      packSize: row.pack_size,
      prescriptionRequired: row.prescription_required,
      hasStock: row.has_stock,
      inventoryMedicineIds: row.matching_medicine_ids ?? [row.id],
    }))
    .sort((left, right) => Number(Boolean(right.hasStock)) - Number(Boolean(left.hasStock)));
}

export async function searchPharmaciesForMedicine(medicineIds: string | string[], prescriptionRequired = false): Promise<PharmacyWithInventory[]> {
  const ids = [...new Set(Array.isArray(medicineIds) ? medicineIds : [medicineIds])].filter(Boolean);
  if (!ids.length) return [];

  const { data, error } = await requireSupabase().rpc("get_customer_medicine_stock_for_medicines", {
    p_medicine_ids: ids,
  });
  if (error) throw error;

  const stockRows = (data ?? []) as CustomerStockRow[];
  const pharmacyIds = [...new Set(stockRows.map((row) => row.pharmacy_id).filter(Boolean))];

  // The stock RPC does not currently return pharmacies.is_active.
  // Fetch the owner's actual On Duty / Off Duty setting separately.
  const { data: dutyRows, error: dutyError } = pharmacyIds.length
    ? await requireSupabase()
      .from("pharmacies")
      .select("id,is_active")
      .in("id", pharmacyIds)
    : { data: [], error: null };

  if (dutyError) throw dutyError;

  const dutyByPharmacyId = new Map<string, boolean>(
    (dutyRows ?? []).map((row: { id: string; is_active: boolean }) => [
      row.id,
      row.is_active === true,
    ] as const),
  );

  const pharmacies = new Map<string, PharmacyWithInventory>();
  for (const row of stockRows) {
    const medicine: Medicine = {
      id: row.medicine_id,
      name: row.medicine_name,
      genericName: row.generic_name ?? "",
      category: "",
      brandName: row.brand_name,
      strength: row.strength,
      dosageForm: row.dosage_form,
      packSize: row.pack_size,
      quantityOnHand: Number(row.quantity_on_hand),
      prescriptionRequired,
    };
    const pharmacyRow: PharmacyRow = {
      id: row.pharmacy_id,
      name: row.pharmacy_name,
      address: row.address,
      phone: row.phone,
      city: row.city,
      district: row.district,
      state: row.state,
      latitude: row.latitude,
      longitude: row.longitude,
      opening_time: row.opening_time,
      closing_time: row.closing_time,
      is_24_hours: row.is_24_hours,
      is_active: dutyByPharmacyId.get(row.pharmacy_id) === true,
    };
    // Do not show pharmacies whose owner has switched Off Duty.
    if (!pharmacyRow.is_active) continue;

    const pharmacy = pharmacies.get(row.pharmacy_id) ?? {
      ...toPharmacy(pharmacyRow, []),
      availableMedicines: [],
      priceRange: "Prices not listed",
    };
    pharmacy.availableMedicines.push(medicine);
    pharmacies.set(row.pharmacy_id, pharmacy);
  }

  return [...pharmacies.values()].map((pharmacy) => {
    return {
      ...pharmacy,
      priceRange: "Price after pharmacy review",
    };
  });
}

export async function searchPharmaciesFromDatabase(query: string): Promise<PharmacyWithInventory[]> {
  const db = requireSupabase();
  const [pharmacyResult, inventoryResult] = await Promise.all([
    db.from("pharmacies")
      .select("id,name,address,phone,state,district,city,latitude,longitude,opening_time,closing_time,is_24_hours,is_active")
      .eq("is_active", true),
    db.from("pharmacy_inventory_status")
      .select("pharmacy_id,pharmacy_name,state,district,city,medicine_id,medicine_name,generic_name,quantity_on_hand,reorder_level,selling_price,average_purchase_cost,nearest_expiry,brand_name,category,strength,dosage_form,pack_size,manufacturer,prescription_required")
      .gt("quantity_on_hand", 0)
      .order("medicine_name")
      .limit(10000),
  ]);
  if (pharmacyResult.error) throw pharmacyResult.error;
  if (inventoryResult.error) throw inventoryResult.error;
  const pharmacies = (pharmacyResult.data ?? []) as PharmacyRow[];
  const inventory = (inventoryResult.data ?? []) as InventoryRow[];
  const q = query.trim().toLowerCase();
  return pharmacies.map(p => toPharmacy(p, inventory.filter(i => i.pharmacy_id === p.id)))
    .filter(p => p.availableMedicines.length > 0)
    .map(p => ({
      ...p, availableMedicines: p.availableMedicines.filter(m =>
        !q || m.name.toLowerCase().includes(q) || m.genericName.toLowerCase().includes(q)
      )
    }))
    .filter(p => !q || p.availableMedicines.length > 0);
}

export async function getPharmacyFromDatabase(id: string): Promise<PharmacyWithInventory | null> {
  const db = requireSupabase();
  const { data: p, error: pError } = await db.from("pharmacies")
    .select("id,name,address,phone,state,district,city,latitude,longitude,opening_time,closing_time,is_24_hours,is_active")
    .eq("id", id).eq("is_active", true).maybeSingle();
  if (pError) throw pError;
  if (!p) return null;
  const { data: rows, error } = await db.from("pharmacy_inventory_status")
    .select("pharmacy_id,pharmacy_name,state,district,city,medicine_id,medicine_name,generic_name,quantity_on_hand,reorder_level,selling_price,average_purchase_cost,nearest_expiry,brand_name,category,strength,dosage_form,pack_size,manufacturer,prescription_required")
    .eq("pharmacy_id", id).gt("quantity_on_hand", 0).order("medicine_name").limit(10000);
  if (error) throw error;
  return toPharmacy(p as PharmacyRow, (rows ?? []) as InventoryRow[]);
}
