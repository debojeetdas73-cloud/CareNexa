import { useState, useMemo, useRef } from "react";
import { X, CheckCircle2, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Pharmacy } from "@/data/pharmacies";
import { placeOnlineOrder } from "@/lib/pharmacyDatabase";
import { requireSupabase } from "@/lib/supabase";
import type { Medicine } from "@/data/medicines";

interface OrderModalProps {
  pharmacy: Pharmacy;
  medicine?: Medicine;
  onClose: () => void;
}

const OrderModal = ({ pharmacy, medicine, onClose }: OrderModalProps) => {
  const [step, setStep] = useState<"form" | "success">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [selectedMeds, setSelectedMeds] = useState<string[]>(medicine ? [medicine.name] : []);
  const [quantity, setQuantity] = useState(1);
  const [delivery, setDelivery] = useState<"delivery" | "pickup">("delivery");
  const [medicineSearch, setMedicineSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const submitLock = useRef(false);

  // Filter medicines based on search
  const filteredMedicines = useMemo(() => {
    if (!medicineSearch.trim()) return [];
    return pharmacy.availableMedicines.filter((m) =>
      m.name.toLowerCase().includes(medicineSearch.toLowerCase()) ||
        m.genericName.toLowerCase().includes(medicineSearch.toLowerCase()) ||
        m.brandName?.toLowerCase().includes(medicineSearch.toLowerCase()) ||
        m.category.toLowerCase().includes(medicineSearch.toLowerCase())
    );
  }, [pharmacy, medicineSearch]);

  const toggleMed = (medName: string) => {
    setSelectedMeds((prev) =>
      prev.includes(medName) ? prev.filter((m) => m !== medName) : [...prev, medName]
    );
  };

  const removeMed = (medName: string) => {
    setSelectedMeds((prev) => prev.filter((m) => m !== medName));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError("");
    setNeedsSignIn(false);
    try {
      const { data: { user }, error: authError } = await requireSupabase().auth.getUser();
      if (authError) throw authError;
      if (!user) {
        setNeedsSignIn(true);
        throw new Error("Sign in before sending a request so you can review the pharmacy's price quote.");
      }
      const selectedItems = selectedMeds.map((medName) => {
        const med = pharmacy.availableMedicines.find((m) => m.name === medName);
        if (!med?.id) throw new Error(`${medName} is not linked to a database medicine record.`);
        return { medicineId: med.id, quantity: medicine?.id === med.id ? quantity : 1 };
      });
      await placeOnlineOrder({
        pharmacyId: pharmacy.id,
        customerName: name,
        customerPhone: phone,
        deliveryAddress: delivery === "delivery" ? address : null,
        fulfillment: delivery,
        items: selectedItems,
      });
      setStep("success");
    } catch (error) {
      console.error("Order submission failed:", error);
      setSubmitError(error instanceof Error ? error.message : "Order could not be saved. Please try again.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl animate-fade-up max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "success" ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
            <h3 className="font-display mt-4 text-2xl font-bold text-foreground">Request sent!</h3>
            <p className="mt-2 text-muted-foreground">
              Your request was sent to <span className="font-semibold text-foreground">{pharmacy.name}</span>. Check your orders and accept the final quote before fulfillment starts.
            </p>
            <Link to="/profile" onClick={onClose} className="mt-5 inline-block text-sm font-bold text-primary underline">Track order and review quote</Link>
            <Button onClick={onClose} className="mt-6" size="lg">
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">Request medicine</h3>
                <p className="text-sm text-muted-foreground">{pharmacy.name}</p>
              </div>
              <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-2">
              {submitError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{submitError}{needsSignIn&&<Link to="/account" onClick={onClose} className="ml-1 font-bold underline">Sign in</Link>}</div>}
              {medicine ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-semibold text-foreground">{medicine.name}{medicine.strength && !medicine.name.toLocaleLowerCase().includes(medicine.strength.toLocaleLowerCase()) ? ` · ${medicine.strength}` : ""}</p><p className="mt-0.5 text-xs text-muted-foreground">{[medicine.genericName, medicine.brandName, medicine.dosageForm, medicine.packSize].filter(Boolean).join(" · ")}</p><p className="mt-1.5 text-xs font-semibold text-primary">{medicine.quantityOnHand ?? "—"} available · pharmacy price after review</p></div>
                  <label className="text-xs font-semibold text-muted-foreground">Quantity<input aria-label={`Quantity of ${medicine.name}`} type="number" min="1" max={medicine.quantityOnHand ?? undefined} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(Number(medicine.quantityOnHand ?? 1), Number(event.target.value) || 1)))} className="mt-1 block h-10 w-24 rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">The pharmacy will confirm availability and send the price after reviewing your request.</p>
              </div> : <>
              {/* The pharmacy detail fallback still uses the same catalogue IDs. */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Search & Add Medicines</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, generic, or category..."
                    value={medicineSearch}
                    onChange={(e) => setMedicineSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Filtered medicines dropdown */}
              {medicineSearch && (
                <div className="border border-border rounded-lg max-h-48 overflow-y-auto bg-secondary/30">
                  {filteredMedicines.length > 0 ? (
                    <div className="divide-y divide-border">
                      {filteredMedicines.slice(0, 10).map((m) => (
                        <button
                          type="button"
                          key={m.name}
                          onClick={() => {
                            toggleMed(m.name);
                            setMedicineSearch("");
                          }}
                          className={`w-full px-3 py-2 text-left text-sm transition-colors ${selectedMeds.includes(m.name)
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-secondary text-foreground"
                            }`}
                        >
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.genericName} • {m.category}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No medicines found
                    </div>
                  )}
                </div>
              )}

              {/* Selected Medicines */}
              {selectedMeds.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Selected Medicines ({selectedMeds.length})</label>
                  <div className="space-y-1.5 border border-border rounded-lg p-2 bg-secondary/20 max-h-32 overflow-y-auto">
                    {selectedMeds.map((medName) => {
                      const med = pharmacy.availableMedicines.find((m) => m.name === medName);
                      return (
                        <div key={medName} className="flex items-center justify-between bg-card p-2 rounded border border-border/50">
                          <div className="flex-1">
                            <div className="text-xs font-medium text-foreground">{medName}</div>
                            <div className="text-xs text-muted-foreground">{med?.category}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMed(medName)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              </>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="order-customer-name" className="mb-1.5 block text-sm font-medium text-foreground">Full Name</label>
                  <input
                    id="order-customer-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label htmlFor="order-customer-phone" className="mb-1.5 block text-sm font-medium text-foreground">Phone</label>
                  <input
                    id="order-customer-phone"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Fulfillment</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["delivery", "pickup"] as const).map((opt) => (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => setDelivery(opt)}
                      className={`rounded-lg border py-2.5 text-sm font-medium capitalize transition-all ${delivery === opt
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                    >
                      {opt === "delivery" ? "🚚 Home Delivery" : "🏪 Store Pickup"}
                    </button>
                  ))}
                </div>
              </div>

              {delivery === "delivery" && (
                <div>
                  <label htmlFor="order-delivery-address" className="mb-1.5 block text-sm font-medium text-foreground">Delivery Address</label>
                  <textarea
                    id="order-delivery-address"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting || selectedMeds.length === 0 || !name || !phone || (delivery === "delivery" && !address) || (medicine ? quantity > Number(medicine.quantityOnHand || 0) : false)}
              >
                {submitting ? "Sending request…" : "Send request to pharmacy"} ({selectedMeds.length} item{selectedMeds.length !== 1 ? "s" : ""})
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderModal;
