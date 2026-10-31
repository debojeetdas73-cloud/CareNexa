import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InventoryOperations from "@/components/InventoryOperations";
import PharmacyDashboard from "@/pages/PharmacyDashboard";

const { requireSupabaseMock } = vi.hoisted(() => ({ requireSupabaseMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ requireSupabase: requireSupabaseMock }));
vi.mock("@/components/PharmacyVerificationDocuments", () => ({ default: () => null }));
vi.mock("@/components/PharmacyInventoryWorkspace", () => ({
  default: ({ section, canManage }: { section: string; canManage: boolean }) => (
    <div><output data-testid="inventory-section">{section}</output><output data-testid="inventory-manage">{String(canManage)}</output></div>
  ),
}));

type QueryResponse = { data: unknown; error: null };
const pharmacyRow = {
  id: "pharmacy-1",
  owner_user_id: "owner-1",
  name: "Test Pharmacy",
  phone: "9000000000",
  address: "1 Main Street",
  city: "Pune",
  district: "Pune",
  state: "Maharashtra",
  verification_status: "approved",
  is_active: true,
};
const inventoryRows = [{
  pharmacy_id: "pharmacy-1",
  medicine_id: "medicine-1",
  medicine_name: "Paracetamol",
  quantity_on_hand: 5,
  reorder_level: 1,
  average_purchase_cost: 2,
  selling_price: 5,
  generic_name: "Acetaminophen",
  brand_name: "Test brand",
  category: "Pain relief",
  strength: "500 mg",
  dosage_form: "tablet",
  pack_size: "10",
}];
const tableRows: Record<string, unknown> = {};

function makeQuery(table: string) {
  const result: QueryResponse = { data: tableRows[table] ?? [], error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: QueryResponse) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

const fakeDb = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: { id: "owner-1" } }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
  from: vi.fn((table: string) => makeQuery(table)),
  rpc: vi.fn(async () => ({ data: null, error: null })),
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="router-location">{location.pathname}{location.hash}</output>;
}

function renderDashboard(initialEntry = "/pharmacy-dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LocationProbe />
      <Routes>
        <Route path="/pharmacy-dashboard" element={<PharmacyDashboard />} />
        <Route path="/pharmacy-dashboard/inventory/:section" element={<PharmacyDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
  Object.assign(tableRows, {
    pharmacies: pharmacyRow,
    pharmacy_inventory_status: inventoryRows,
    orders: [],
    medicine_batches: [],
    purchases: [],
    stock_movements: [],
  });
  fakeDb.from.mockClear();
  fakeDb.rpc.mockClear();
  fakeDb.auth.getUser.mockClear();
  requireSupabaseMock.mockReturnValue(fakeDb);
});

afterEach(() => cleanup());

describe("pharmacy inventory navigation", () => {
  it("opens only on click, stays open on an inventory route, and closes outside inventory", async () => {
    renderDashboard();
    const inventory = await screen.findByRole("button", { name: "Inventory" });

    fireEvent.mouseEnter(inventory);
    expect(inventory).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(inventory);
    expect(inventory).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(screen.getByRole("group", { name: "Inventory pages" })).getByRole("button", { name: "All medicines" }));

    expect(await screen.findByTestId("inventory-section")).toHaveTextContent("medicines");
    await waitFor(() => expect(screen.getByTestId("router-location")).toHaveTextContent("/pharmacy-dashboard/inventory/medicines"));
    expect(screen.getByRole("button", { name: "Inventory" })).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("group", { name: "Inventory pages" })).getByRole("button", { name: "All medicines" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    expect(await screen.findByRole("button", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Inventory" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps inventory changes locked for a pharmacy pending approval", async () => {
    tableRows.pharmacies = { ...pharmacyRow, verification_status: "pending" };
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "Inventory" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Inventory pages" })).getByRole("button", { name: "Purchase / Add stock" }));

    expect(await screen.findByTestId("inventory-manage")).toHaveTextContent("false");
  });
});

describe("inventory operations", () => {
  it("adds a catalogue medicine through the existing RPC", async () => {
    render(<InventoryOperations pharmacyId="pharmacy-1" inventory={[]} onSaved={vi.fn(async () => undefined)} canManage />);
    const name = screen.getByLabelText("Medicine name");
    fireEvent.change(name, { target: { value: "Cetirizine" } });
    fireEvent.change(screen.getByLabelText(/Dosage form or product type/), { target: { value: "syrup" } });
    fireEvent.change(screen.getByLabelText(/Pack size \/ container/), { target: { value: "100 ml bottle" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to inventory" }));

    await waitFor(() => expect(fakeDb.rpc).toHaveBeenCalledWith("add_pharmacy_medicine", expect.objectContaining({
      p_pharmacy_id: "pharmacy-1",
      p_name: "Cetirizine",
      p_dosage_form: "syrup",
      p_pack_size: "100 ml bottle",
      p_reorder_level: 10,
      p_selling_price: 0,
    })));
    expect(document.querySelector('#medicine-form-suggestions option[value="capsule"]')).toBeInTheDocument();
    expect(document.querySelector('#medicine-package-suggestions option[value="bottle"]')).toBeInTheDocument();
  });

  it("records a received purchase with the existing secure RPC and refreshes stock", async () => {
    const onSaved = vi.fn(async () => undefined);
    render(<InventoryOperations
      pharmacyId="pharmacy-1"
      inventory={inventoryRows}
      onSaved={onSaved}
      canManage
      initialAction="purchase"
    />);

    fireEvent.change(screen.getByLabelText("Medicine"), { target: { value: "medicine-1" } });
    const values: Record<string, string> = {
      quantity: "12",
      unit_cost: "2.5",
      selling_price: "5.25",
      supplier_name: "Health Supply",
      invoice_number: "INV-22",
      batch_number: "B-100",
      expiry_date: "2027-12-31",
      manufacturing_date: "2025-11-01",
      notes: "Received and checked",
    };
    for (const [name, value] of Object.entries(values)) {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
      if (!input) throw new Error(`Missing form control ${name}`);
      fireEvent.change(input, { target: { value } });
    }

    fireEvent.click(screen.getByRole("button", { name: "Record purchase" }));
    await waitFor(() => expect(fakeDb.rpc).toHaveBeenCalledWith("record_pharmacy_purchase", {
      p_pharmacy_id: "pharmacy-1",
      p_medicine_id: "medicine-1",
      p_quantity: 12,
      p_unit_cost: 2.5,
      p_selling_price: 5.25,
      p_supplier_name: "Health Supply",
      p_invoice_number: "INV-22",
      p_batch_number: "B-100",
      p_expiry_date: "2027-12-31",
      p_notes: "Received and checked",
      p_manufacturing_date: "2025-11-01",
    }));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("Purchase recorded");
  });

  it("records a manual sale through the existing RPC", async () => {
    render(<InventoryOperations pharmacyId="pharmacy-1" inventory={inventoryRows} onSaved={vi.fn(async () => undefined)} canManage initialAction="sale" />);
    fireEvent.change(screen.getByLabelText("Medicine"), { target: { value: "medicine-1" } });
    fireEvent.change(document.querySelector<HTMLInputElement>('[name="quantity"]')!, { target: { value: "2" } });
    fireEvent.change(document.querySelector<HTMLTextAreaElement>('[name="note"]')!, { target: { value: "Counter sale" } });
    fireEvent.click(screen.getByRole("button", { name: "Record manual sale" }));

    await waitFor(() => expect(fakeDb.rpc).toHaveBeenCalledWith("record_pharmacy_manual_sale", {
      p_pharmacy_id: "pharmacy-1",
      p_medicine_id: "medicine-1",
      p_quantity: 2,
      p_unit_selling_price: null,
      p_note: "Counter sale",
    }));
  });

  it("renders no inventory form before pharmacy approval", () => {
    render(<InventoryOperations pharmacyId="pharmacy-1" inventory={inventoryRows} onSaved={vi.fn(async () => undefined)} canManage={false} />);
    expect(screen.getByRole("heading", { name: "Inventory changes are locked" })).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});
