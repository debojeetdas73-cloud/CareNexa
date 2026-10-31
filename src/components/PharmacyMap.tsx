import { useEffect, useMemo, useRef, useState } from "react";
import L, { type CircleMarker, type Map as LeafletMap, type TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Pharmacy } from "@/data/pharmacies";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Pill } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface PharmacyMapProps {
  pharmacies: Pharmacy[];
  onOrder: (pharmacy: Pharmacy) => void;
}

const getCssTokenValue = (token: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value ? `hsl(${value})` : "hsl(168 62% 38%)";
};

const PharmacyMap = ({ pharmacies, onOrder }: PharmacyMapProps) => {
  const sectionRef = useScrollReveal<HTMLDivElement>();
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(pharmacies[0] ?? null);

  const center = useMemo<[number, number]>(() => {
    if (pharmacies.length === 0) return [12.9716, 77.5946];

    return [
      pharmacies.reduce((sum, pharmacy) => sum + pharmacy.lat, 0) / pharmacies.length,
      pharmacies.reduce((sum, pharmacy) => sum + pharmacy.lng, 0) / pharmacies.length,
    ];
  }, [pharmacies]);

  useEffect(() => {
    if (pharmacies.length === 0) {
      setSelectedPharmacy(null);
      return;
    }

    setSelectedPharmacy((current) => {
      if (current && pharmacies.some((pharmacy) => pharmacy.id === current.id)) {
        return current;
      }

      return pharmacies[0];
    });
  }, [pharmacies]);

  useEffect(() => {
    if (!mapElementRef.current || pharmacies.length === 0) return;

    const primary = getCssTokenValue("--primary");
    const accent = getCssTokenValue("--accent");
    const destructive = getCssTokenValue("--destructive");
    const card = getCssTokenValue("--card");

    if (!mapRef.current) {
      mapRef.current = L.map(mapElementRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      }).setView(center, 13);

      tileLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapRef.current);

      markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;

    if (!map || !markerLayer) return;

    markerLayer.clearLayers();

    const markers: CircleMarker[] = pharmacies.map((pharmacy) => {
      const marker = L.circleMarker([pharmacy.lat, pharmacy.lng], {
        radius: 10,
        color: pharmacy.openNow ? primary : destructive,
        weight: 3,
        fillColor: pharmacy.openNow ? accent : destructive,
        fillOpacity: 0.9,
      });

      marker.bindTooltip(pharmacy.name, {
        direction: "top",
        offset: [0, -10],
        opacity: 0.95,
      });

      marker.on("click", () => {
        setSelectedPharmacy(pharmacy);
      });

      marker.addTo(markerLayer);
      return marker;
    });

    if (markers.length === 1) {
      map.setView([pharmacies[0].lat, pharmacies[0].lng], 14);
    } else {
      const bounds = L.latLngBounds(pharmacies.map((pharmacy) => [pharmacy.lat, pharmacy.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
    }

    mapElementRef.current.style.background = card;

    return () => {
      markerLayer.clearLayers();
    };
  }, [center, pharmacies]);

  useEffect(() => {
    return () => {
      markerLayerRef.current?.clearLayers();
      tileLayerRef.current?.remove();
      mapRef.current?.remove();
      markerLayerRef.current = null;
      tileLayerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  if (pharmacies.length === 0 || !selectedPharmacy) return null;

  return (
    <section className="px-4 py-12">
      <div ref={sectionRef} className="container mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="font-display text-xl font-bold text-foreground">Pharmacies on Map</h3>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div ref={mapElementRef} className="h-[400px] w-full" aria-label="Pharmacy locations map" />
          </div>

          <aside className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected pharmacy</p>
            <h4 className="mt-2 font-display text-2xl font-bold text-foreground">{selectedPharmacy.name}</h4>

            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>{selectedPharmacy.address}</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span>{selectedPharmacy.phone}</span>
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span
                className={selectedPharmacy.openNow ? "rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" : "rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"}
              >
                {selectedPharmacy.openNow ? "Open now" : "Currently closed"}
              </span>
              <span className="text-sm text-muted-foreground">{selectedPharmacy.availableMedicines[0]?.name}</span>
            </div>
            {selectedPharmacy.availableMedicines[0] && <p className="mt-3 flex items-center gap-2 text-sm"><Pill className="h-4 w-4 text-primary" /><span>{selectedPharmacy.availableMedicines[0].quantityOnHand} available</span></p>}
            <p className="mt-2 text-xs text-muted-foreground">The pharmacy checks your request and sends a price quote.</p>

            <div className="mt-5 flex flex-wrap gap-2">
              {pharmacies.map((pharmacy) => (
                <button
                  key={pharmacy.id}
                  type="button"
                  onClick={() => {
                    setSelectedPharmacy(pharmacy);
                    mapRef.current?.setView([pharmacy.lat, pharmacy.lng], 14);
                  }}
                  className={pharmacy.id === selectedPharmacy.id ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors" : "rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"}
                >
                  {pharmacy.name}
                </button>
              ))}
            </div>

            <Button
              className="mt-6 w-full"
              size="lg"
              onClick={() => onOrder(selectedPharmacy)}
              disabled={!selectedPharmacy.openNow}
            >
              Order from this pharmacy
            </Button>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default PharmacyMap;
