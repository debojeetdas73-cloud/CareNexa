import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import HowItWorks from "@/components/HowItWorks";
import PharmacyResults from "@/components/PharmacyResults";
import PharmacyMap from "@/components/PharmacyMap";
import PharmacyFilters, { type PharmacyFilterState, type SortOption } from "@/components/PharmacyFilters";
import PrescriptionUpload from "@/components/PrescriptionUpload";
import OrderModal from "@/components/OrderModal";
import Footer from "@/components/Footer";
import type { Pharmacy } from "@/data/pharmacies";
import { searchPharmaciesForMedicine } from "@/lib/pharmacyData";
import { distanceInKm, type Coordinates } from "@/lib/geolocation";
import type { Medicine } from "@/data/medicines";

const parseDistance = (dist: string): number => {
  const value = parseFloat(dist);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
};

const Index = () => {
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [customerLocation, setCustomerLocation] = useState<Coordinates | null>(null);
  const [results, setResults] = useState<Pharmacy[]>([]);
  const [orderPharmacy, setOrderPharmacy] = useState<Pharmacy | null>(null);
  const [orderMedicine, setOrderMedicine] = useState<Medicine | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [filters, setFilters] = useState<PharmacyFilterState>({
    openNow: false,
    maxDistance: 5,
    sortBy: "distance",
  });
  const searchVersion = useRef(0);

  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash;
      if (!hash) return;
      const id = hash.replace("#", "");
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  const filteredResults = useMemo(() => {
    const withDistances = results.map((pharmacy) => {
      if (!customerLocation || (pharmacy.lat === 0 && pharmacy.lng === 0)) return pharmacy;
      const distance = distanceInKm(customerLocation, { latitude: pharmacy.lat, longitude: pharmacy.lng });
      return distance === null ? pharmacy : { ...pharmacy, distance: `${distance.toFixed(1)} km` };
    });
    const filtered = withDistances.filter((p) => {
      if (filters.openNow && !p.openNow) return false;
      const distance = parseDistance(p.distance);
      if (customerLocation && Number.isFinite(distance) && distance > filters.maxDistance) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (filters.sortBy) {
        case "distance":
          return parseDistance(a.distance) - parseDistance(b.distance);
        case "rating":
          return b.rating - a.rating;
        default:
          return 0;
      }
    });
  }, [results, filters, customerLocation]);
  const mapResults = filteredResults.filter((pharmacy) => Number.isFinite(pharmacy.lat) && Number.isFinite(pharmacy.lng) && !(pharmacy.lat === 0 && pharmacy.lng === 0));

  const handleSearch = async (medicine: Medicine | null) => {
    const version = ++searchVersion.current;
    setSearchError("");
    setSelectedMedicine(medicine);
    setResults([]);
    setIsSearching(false);
    if (!medicine) return;
    if (!medicine.id) {
      setSearchError("This catalogue item is missing its medicine ID. Please choose another result.");
      return;
    }

    setIsSearching(true);
    try {
      const medicineIds = medicine.inventoryMedicineIds?.length ? medicine.inventoryMedicineIds : medicine.id;
      const databaseResults = await searchPharmaciesForMedicine(medicineIds, medicine.prescriptionRequired);
      if (version === searchVersion.current) setResults(databaseResults);
    } catch (error) {
      if (version === searchVersion.current) setSearchError(error instanceof Error ? error.message : "Could not load live pharmacy stock.");
    } finally {
      if (version === searchVersion.current) {
        setIsSearching(false);
        window.setTimeout(() => document.getElementById("pharmacies")?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    }
  };

  const handleOrder = (pharmacy: Pharmacy) => {
    const selectedMedicineIds = selectedMedicine?.inventoryMedicineIds ?? (selectedMedicine?.id ? [selectedMedicine.id] : []);
    const medicine = pharmacy.availableMedicines.find((item) => selectedMedicineIds.includes(item.id));
    if (!medicine) return;
    setOrderPharmacy(pharmacy);
    setOrderMedicine(medicine);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection onSearch={handleSearch} onLocationChange={setCustomerLocation} />
      {searchError && (
        <div className="container mx-auto max-w-4xl px-4 pt-8">
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {searchError}{/sign in/i.test(searchError) && <Link to="/account" className="ml-1 font-bold underline">Sign in</Link>}
          </div>
        </div>
      )}
      {isSearching && selectedMedicine && (
        <div className="container mx-auto max-w-4xl px-4 pt-8 text-sm text-muted-foreground">Searching live pharmacy inventory…</div>
      )}
      {selectedMedicine && (
        <div className="container mx-auto max-w-4xl px-4 pt-16 md:pt-24">
          <PharmacyFilters filters={filters} onChange={setFilters} />
        </div>
      )}
      {selectedMedicine && <PharmacyResults results={filteredResults} query={selectedMedicine.name} medicineId={selectedMedicine.id} isSearching={isSearching} onOrder={handleOrder} />}
      {selectedMedicine && mapResults.length > 0 && <PharmacyMap pharmacies={mapResults} onOrder={handleOrder} />}
      <div id="prescription-upload"><PrescriptionUpload customerLocation={customerLocation} /></div>
      <HowItWorks />
      <Footer />
      {orderPharmacy && orderMedicine && (
        <OrderModal pharmacy={orderPharmacy} medicine={orderMedicine} onClose={() => { setOrderPharmacy(null); setOrderMedicine(null); }} />
      )}
    </div>
  );
};

export default Index;
