import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PharmacyInventoryWorkspace from "@/components/PharmacyInventoryWorkspace";

const { requireSupabaseMock } = vi.hoisted(() => ({ requireSupabaseMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ requireSupabase: requireSupabaseMock }));

function renderImportWorkspace() {
  const rpc = vi.fn(async () => ({ data: "medicine-id", error: null }));
  const onReload = vi.fn(async () => undefined);
  requireSupabaseMock.mockReturnValue({ rpc });
  const result = render(<PharmacyInventoryWorkspace
    pharmacyId="pharmacy-1"
    inventory={[]}
    batches={[]}
    purchases={[]}
    movements={[]}
    section="import-export"
    canManage
    onNavigate={vi.fn()}
    onCreateDistributorOrder={vi.fn()}
    onReload={onReload}
    onLoadMoreMovements={vi.fn(async () => undefined)}
    hasMoreMovements={false}
  />);
  return { ...result, rpc, onReload };
}

function csvFile(contents: string) {
  const file = new File([contents], "medicines.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => contents });
  return file;
}

describe("inventory CSV import", () => {
  it("previews duplicates and imports only valid catalogue rows through the approved RPC", async () => {
    const { rpc, onReload } = renderImportWorkspace();
    const csv = [
      "name,generic_name,brand_name,category,strength,dosage_form,pack_size,reorder_level,selling_price",
      "Cetirizine,Cetirizine,AllerFree,Allergy,10 mg,tablet,10,8,12.5",
      "Cetirizine,Cetirizine,AllerFree,Allergy,10 mg,tablet,10,8,12.5",
    ].join("\n");
    fireEvent.change(screen.getByLabelText("Choose CSV"), { target: { files: [csvFile(csv)] } });

    expect(await screen.findByText("Duplicate medicine in this CSV.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 valid rows" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith("add_pharmacy_medicine", {
      p_pharmacy_id: "pharmacy-1",
      p_name: "Cetirizine",
      p_generic_name: "Cetirizine",
      p_brand_name: "AllerFree",
      p_category: "Allergy",
      p_strength: "10 mg",
      p_dosage_form: "tablet",
      p_pack_size: "10",
      p_reorder_level: 8,
      p_selling_price: 12.5,
    });
    expect(onReload).toHaveBeenCalledOnce();
    expect(await screen.findByText(/imported with zero stock/)).toBeInTheDocument();
  });

  it("refuses stock quantity columns instead of importing stock outside a receipt transaction", async () => {
    const { rpc } = renderImportWorkspace();
    const csv = "name,quantity\nIbuprofen,30";
    fireEvent.change(screen.getByLabelText("Choose CSV"), { target: { files: [csvFile(csv)] } });

    expect(await screen.findByText(/Stock quantity columns are not imported/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});
