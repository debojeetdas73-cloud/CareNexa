import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DistributorManagement from "@/components/DistributorManagement";

const { requireSupabaseMock } = vi.hoisted(() => ({ requireSupabaseMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ requireSupabase: requireSupabaseMock }));

const distributor = {
  id: "distributor-1", created_by: "pharmacy-owner", company_name: "City Pharma Supply", contact_person: "Asha Rao",
  phone: "9876543210", email: "sales@citypharma.example", address: "10 Market Road", city: "Pune", service_area: "Pune district",
  medicine_categories: ["Analgesics"], delivery_information: "Weekday delivery", sharing_scope: "private",
};
const pharmacyDistributor = {
  id: "pharmacy-distributor-1", pharmacy_id: "pharmacy-1", distributor_id: distributor.id, is_active: true, is_preferred: true,
};
const medicine = {
  id: "medicine-1", name: "Paracetamol", generic_name: "Acetaminophen", category: "Analgesics",
  strength: "500 mg", dosage_form: "tablet", pack_size: "10 tablets",
};
const listing = { id: "listing-1", pharmacy_distributor_id: pharmacyDistributor.id, medicine_id: medicine.id, unit_price: 2.5, minimum_order_quantity: 5, is_available: true };
const order = {
  id: "order-1", pharmacy_id: "pharmacy-1", pharmacy_distributor_id: pharmacyDistributor.id, distributor_id: distributor.id,
  status: "dispatched", order_date: "2026-10-26T08:00:00Z", total_amount: 25, delivery_instructions: "Rear entrance",
};
const orderItem = {
  id: "order-item-1", order_id: order.id, pharmacy_distributor_medicine_id: listing.id, medicine_id: medicine.id,
  quantity_ordered: 10, quantity_received: 0, unit_price: 2.5, line_total: 25,
};
const rows: Record<string, unknown[]> = {};

function queryFor(table: string) {
  const result = { data: rows[table] || [], error: null };
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

const rpc = vi.fn(async () => ({ data: null, error: null }));
const fakeDb = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: "pharmacy-owner" } }, error: null })) },
  from: vi.fn((table: string) => queryFor(table)),
  rpc,
};

function renderModule(props: Partial<React.ComponentProps<typeof DistributorManagement>> = {}) {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DistributorManagement pharmacyId="pharmacy-1" canManage onInventoryRefresh={vi.fn(async () => undefined)} {...props} /></MemoryRouter>);
}

beforeEach(() => {
  Object.assign(rows, {
    distributors: [distributor],
    pharmacy_distributors: [pharmacyDistributor],
    pharmacy_distributor_medicines: [listing],
    medicines: [medicine],
    distributor_purchase_orders: [],
    distributor_purchase_order_items: [],
    inventory: [{ medicine_id: medicine.id, selling_price: 5 }],
  });
  rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null });
  fakeDb.from.mockClear(); fakeDb.auth.getUser.mockClear(); requireSupabaseMock.mockReturnValue(fakeDb);
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
});

afterEach(() => vi.unstubAllGlobals());

describe("pharmacy distributor management", () => {
  it("shows this pharmacy's supplier contact and filters by supplier category", async () => {
    renderModule();

    expect(await screen.findByRole("heading", { name: "Your distributors" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View supplier" }));
    expect(screen.getByRole("link", { name: "9876543210" })).toHaveAttribute("href", "tel:9876543210");
    fireEvent.change(screen.getByLabelText("Filter by medicine category"), { target: { value: "Analgesics" } });
    expect(screen.getAllByText("City Pharma Supply")).toHaveLength(2);
    expect(screen.getAllByText("Private to this pharmacy")).toHaveLength(2);
  });

  it("prefills a low-stock medicine, reviews the total, and submits to the pharmacy's linked supplier", async () => {
    renderModule({ initialMedicineId: medicine.id, initialQuantity: 9 });
    const quantity = await screen.findByRole("spinbutton", { name: "Order quantity for Paracetamol" });
    await waitFor(() => expect(quantity).toHaveValue(9));
    fireEvent.click(screen.getByRole("button", { name: "Review order" }));
    expect(screen.getByText(/9 × ₹2.5 = ₹22.5/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and place order" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("create_distributor_purchase_order", {
      p_pharmacy_distributor_id: pharmacyDistributor.id,
      p_items: [{ pharmacy_distributor_medicine_id: listing.id, quantity: 9 }],
      p_delivery_instructions: null,
    }));
  });

  it("adds stock only after the pharmacy confirms a goods receipt", async () => {
    rows.distributor_purchase_orders = [order]; rows.distributor_purchase_order_items = [orderItem];
    const refreshInventory = vi.fn(async () => undefined);
    renderModule({ initialMedicineId: medicine.id, onInventoryRefresh: refreshInventory });
    fireEvent.click(await screen.findByRole("button", { name: "Record goods receipt" }));
    fireEvent.change(screen.getByLabelText("Received quantity"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Batch number"), { target: { value: "BATCH-1" } });
    fireEvent.change(screen.getByLabelText("Expiry date"), { target: { value: "2030-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm goods receipt" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("record_distributor_goods_receipt", expect.objectContaining({
      p_order_id: order.id, p_idempotency_key: "11111111-1111-4111-8111-111111111111",
      p_lines: [{ order_item_id: orderItem.id, quantity_received: 4, batch_number: "BATCH-1", expiry_date: "2030-12-31", manufacturing_date: null, selling_price: 5 }],
    })));
    expect(refreshInventory).toHaveBeenCalledOnce();
  });

  it("stores a pharmacy's private supplier contact without exposing it as shared", async () => {
    rows.distributors = []; rows.pharmacy_distributors = []; rows.pharmacy_distributor_medicines = [];
    renderModule();
    fireEvent.click(await screen.findByText("Add a distributor to this pharmacy"));
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Northside Medicines" } });
    fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Ravi Patel" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "9123456789" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "15 Lake Road" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Nashik" } });
    fireEvent.click(screen.getByRole("button", { name: "Add distributor" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_pharmacy_distributor", expect.objectContaining({
      p_pharmacy_id: "pharmacy-1", p_company_name: "Northside Medicines", p_contact_person: "Ravi Patel", p_phone: "9123456789",
      p_address: "15 Lake Road", p_city: "Nashik", p_medicine_categories: [], p_sharing_scope: "private",
    })));
  });

  it("lets a pharmacy link a supplier another pharmacy explicitly shared", async () => {
    rows.distributors = [{ ...distributor, created_by: "other-owner", sharing_scope: "shared" }];
    rows.pharmacy_distributors = []; rows.pharmacy_distributor_medicines = [];
    renderModule();
    fireEvent.click(await screen.findByRole("button", { name: "Add shared supplier to this pharmacy" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("link_shared_distributor", { p_pharmacy_id: "pharmacy-1", p_distributor_id: distributor.id }));
  });
});
