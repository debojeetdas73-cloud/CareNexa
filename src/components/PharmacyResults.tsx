import { MapPin, Clock, Phone as PhoneIcon, Pill, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Pharmacy } from "@/data/pharmacies";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface PharmacyResultsProps {
  results: Pharmacy[];
  query: string;
  medicineId?: string;
  isSearching?: boolean;
  onOrder: (pharmacy: Pharmacy) => void;
}

const PharmacyResults = ({ results, query, medicineId, isSearching = false, onOrder }: PharmacyResultsProps) => {
  const ref = useScrollReveal();

  if (!query) return null;

  return (
    <section id="pharmacies" className="px-4 py-12 md:py-16">
      <div ref={ref} className="container mx-auto max-w-4xl">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">
            Pharmacies with <span className="text-primary">{query}</span> in stock
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Approved pharmacies · live stock · the pharmacy sends its price after review</p>
        </div>

        {isSearching && <p role="status" className="rounded-xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground">Checking approved pharmacies for current stock…</p>}

        {!isSearching && results.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Pill className="mx-auto text-primary" size={24} />
            <p className="mt-3 font-semibold text-foreground">No approved pharmacy has this medicine in stock</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another catalogue item or check back later.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {results.map((pharmacy, index) => {
            const medicine = pharmacy.availableMedicines.find((item) => item.id === medicineId) ?? pharmacy.availableMedicines[0];
            if (!medicine) return null;
            return <article
              key={pharmacy.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 sm:p-5"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold text-foreground">{pharmacy.name}</h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pharmacy.openNow ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {pharmacy.openNow ? "Open now" : "Closed now"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-start gap-1"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{Number.isFinite(Number.parseFloat(pharmacy.distance)) ? `${pharmacy.distance} · ` : ""}{pharmacy.address}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{pharmacy.hours}</span>
                    {pharmacy.phone !== "Not provided" && <a href={`tel:${pharmacy.phone}`} className="flex items-center gap-1 hover:text-primary"><PhoneIcon className="h-3.5 w-3.5" />{pharmacy.phone}</a>}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/5 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{medicine.name}{medicine.strength && !medicine.name.toLocaleLowerCase().includes(medicine.strength.toLocaleLowerCase()) ? ` · ${medicine.strength}` : ""}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{[medicine.genericName, medicine.brandName, medicine.dosageForm, medicine.packSize, medicine.manufacturer].filter(Boolean).join(" · ")}</p>
                      <p className="mt-1 text-xs font-semibold text-primary">{medicine.quantityOnHand} available</p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-semibold text-primary">Price after pharmacy review</p>
                  </div>
                </div>

                <Button onClick={() => onOrder(pharmacy)} disabled={!pharmacy.openNow} className="w-full shrink-0 sm:w-auto" size="sm">
                  <ShoppingCart className="h-4 w-4" />
                  {pharmacy.openNow ? "Request from pharmacy" : "Currently closed"}
                </Button>
              </div>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
};

export default PharmacyResults;
