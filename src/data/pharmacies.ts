import type { Medicine } from "./medicines";

// Pharmacy records and inventory are loaded from Supabase at runtime.
// This file intentionally contains types only; it has no hard-coded sample pharmacies.
export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  distance: string;
  rating: number;
  reviewCount: number;
  phone: string;
  openNow: boolean;
  hours: string;
  availableMedicines: Medicine[];
  priceRange: string;
  lat: number;
  lng: number;
  state?: string;
  district?: string;
  city?: string;
}
