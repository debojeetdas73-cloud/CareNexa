import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrderModal from "@/components/OrderModal";
import type { Pharmacy } from "@/data/pharmacies";
import type { Medicine } from "@/data/medicines";
import { searchMedicineCatalogue, searchPharmaciesForMedicine } from "@/lib/pharmacyData";

const { requireSupabaseMock } = vi.hoisted(() => ({ requireSupabaseMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ requireSupabase: requireSupabaseMock }));

const catalogue = [
  { id: "med-1", name: "Ibuprofen 200", generic_name: "Ibuprofen", brand_name: "PainAway", category: "Pain relief", strength: "200 mg", dosage_form: "Tablet", pack_size: "10 tablets", manufacturer: null, prescription_required: false, has_stock: false, matching_medicine_ids: ["med-1"] },
  { id: "med-rx", name: "Ibuprofen 600", generic_name: "Ibuprofen", brand_name: null, category: "Pain relief", strength: "600 mg", dosage_form: "Tablet", pack_size: "10 tablets", manufacturer: null, prescription_required: true, has_stock: true, matching_medicine_ids: ["med-rx", "med-rx-copy"] },
];

const stockRow = {
  pharmacy_id: "pharmacy-1",
  pharmacy_name: "Approved Pharmacy",
  address: "1 Main Street",
  phone: "9000000000",
  city: "Pune",
  district: "Pune",
  state: "Maharashtra",
  latitude: 18.52,
  longitude: 73.85,
  opening_time: "09:00:00",
  closing_time: "21:00:00",
  is_24_hours: false,
  medicine_id: "med-1",
  medicine_name: "Ibuprofen 200",
  generic_name: "Ibuprofen",
  brand_name: "PainAway",
  strength: "200 mg",
  dosage_form: "Tablet",
  pack_size: "10 tablets",
  quantity_on_hand: 8,
  selling_price: 42.5,
};

const prescriptionStockRow = {
  ...stockRow,
  medicine_id: "med-rx",
  medicine_name: "Ibuprofen 600",
};

const prescriptionStockCopyRow = {
  ...prescriptionStockRow,
  medicine_id: "med-rx-copy",
};

const medicine: Medicine = {
  id: "med-1",
  name: "Ibuprofen 200",
  genericName: "Ibuprofen",
  brandName: "PainAway",
  category: "Pain relief",
  strength: "200 mg",
  dosageForm: "Tablet",
  packSize: "10 tablets",
  prescriptionRequired: false,
  quantityOnHand: 8,
  sellingPrice: 42.5,
};

const pharmacy: Pharmacy = {
  id: "pharmacy-1",
  name: "Approved Pharmacy",
  address: "1 Main Street, Pune, Pune, Maharashtra",
  distance: "—",
  rating: 0,
  reviewCount: 0,
  phone: "9000000000",
  openNow: true,
  hours: "9:00 AM – 9:00 PM",
  availableMedicines: [medicine],
  priceRange: "₹42.5",
  lat: 18.52,
  lng: 73.85,
  state: "Maharashtra",
  district: "Pune",
  city: "Pune",
};

const fakeDb = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: "customer-1" } }, error: null })) },
  rpc: vi.fn(async (name: string, args?: { p_medicine_id?: string; p_medicine_ids?: string[]; p_query?: string }) => {
    if (name === "search_customer_medicine_catalogue") return { data: catalogue, error: null };
    if (name === "get_customer_medicine_stock_for_medicines") {
      return { data: (args?.p_medicine_ids ?? []).flatMap((id) => id === "med-1" ? [stockRow] : id === "med-rx" ? [prescriptionStockRow] : id === "med-rx-copy" ? [prescriptionStockCopyRow] : []), error: null };
    }
    return { data: "order-1", error: null };
  }),
};

beforeEach(() => {
  requireSupabaseMock.mockReturnValue(fakeDb);
  fakeDb.rpc.mockClear();
  fakeDb.auth.getUser.mockClear();
});

afterEach(() => cleanup());

describe("customer medicine selection to pharmacy order", () => {
  it("searches catalogue fields and ranks medicines with pharmacy stock first", async () => {
    const matches = await searchMedicineCatalogue("  ibuprofen  ");

    expect(fakeDb.rpc).toHaveBeenCalledWith("search_customer_medicine_catalogue", { p_query: "ibuprofen" });
    expect(matches.map((row) => row.id)).toEqual(["med-rx", "med-1"]);
    expect(matches[0]).toMatchObject({ name: "Ibuprofen 600", prescriptionRequired: true, hasStock: true, inventoryMedicineIds: ["med-rx", "med-rx-copy"] });
    expect(matches[1]).toMatchObject({ name: "Ibuprofen 200", genericName: "Ibuprofen", brandName: "PainAway", prescriptionRequired: false, hasStock: false });
  });

  it("loads current pharmacy stock by selected medicine ID and submits that same ID and quantity", async () => {
    const [result] = await searchPharmaciesForMedicine("med-1");
    expect(fakeDb.rpc).toHaveBeenNthCalledWith(1, "get_customer_medicine_stock_for_medicines", { p_medicine_ids: ["med-1"] });
    expect(result).toMatchObject({ id: "pharmacy-1", name: "Approved Pharmacy" });
    expect(result.availableMedicines[0]).toMatchObject({ id: "med-1", quantityOnHand: 8, sellingPrice: 42.5 });

    render(<MemoryRouter><OrderModal pharmacy={pharmacy} medicine={medicine} onClose={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByText(/₹42\.5/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Customer One" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "9000000001" } });
    fireEvent.click(screen.getByRole("button", { name: /Store Pickup/ }));
    fireEvent.change(screen.getByLabelText("Quantity of Ibuprofen 200"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm Order/ }));

    await waitFor(() => expect(fakeDb.rpc).toHaveBeenNthCalledWith(2, "place_pharmacy_order", expect.objectContaining({
      p_pharmacy_id: "pharmacy-1",
      p_customer_name: "Customer One",
      p_customer_phone: "9000000001",
      p_fulfillment: "pickup",
      p_items: [{ medicine_id: "med-1", quantity: 3 }],
    })));
    expect(await screen.findByText("Request sent!")).toBeInTheDocument();
  });

  it("lets any selected catalogue medicine be requested, with its price withheld for the pharmacy quote", async () => {
    const prescriptionMedicine: Medicine = {
      ...medicine,
      id: "med-rx",
      name: "Ibuprofen 600",
      strength: "600 mg",
      prescriptionRequired: true,
    };
    const rxPharmacy = { ...pharmacy, availableMedicines: [prescriptionMedicine] };
    render(<MemoryRouter><OrderModal pharmacy={rxPharmacy} medicine={prescriptionMedicine} onClose={vi.fn()} /></MemoryRouter>);

    expect(screen.queryByText("Prescription-only medicines must use a prescription request.")).not.toBeInTheDocument();
    expect(screen.queryByText(/₹42\.5/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Customer One" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "9000000001" } });
    fireEvent.click(screen.getByRole("button", { name: /Store Pickup/ }));
    fireEvent.click(screen.getByRole("button", { name: /Send request to pharmacy/ }));

    await waitFor(() => expect(fakeDb.rpc).toHaveBeenCalledWith("place_pharmacy_order", expect.objectContaining({
      p_pharmacy_id: "pharmacy-1",
      p_items: [{ medicine_id: "med-rx", quantity: 1 }],
    })));
    expect(await screen.findByText("Request sent!")).toBeInTheDocument();
  });

  it("shows inventory matches for prescription medicines while preserving their prescription flag", async () => {
    const results = await searchPharmaciesForMedicine(["med-rx", "med-rx-copy"], true);
    expect(fakeDb.rpc).toHaveBeenCalledWith("get_customer_medicine_stock_for_medicines", { p_medicine_ids: ["med-rx", "med-rx-copy"] });
    expect(results).toHaveLength(1);
    expect(results[0].availableMedicines).toHaveLength(2);
    expect(results[0].availableMedicines[0]).toMatchObject({ id: "med-rx", prescriptionRequired: true });
  });
});
