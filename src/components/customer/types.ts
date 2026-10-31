import type { User } from "@supabase/supabase-js";

export type CustomerTab = "overview" | "orders" | "profile";

export type CustomerOrder = {
  id: string;
  order_number: string | null;
  status: string;
  created_at: string;
  final_total: number | null;
  discount_amount: number | null;
  fulfillment_choice: string | null;
  quote_sent_at: string | null;
  customer_accepted_quote_at: string | null;
  quote_message: string | null;
  prescription_order_id: string | null;
  pharmacies?: { name: string } | { name: string }[] | null;
  order_items?: Array<{
    quantity: number;
    medicines?: { name: string; strength: string | null } | { name: string; strength: string | null }[] | null;
  }>;
};

export type PharmacyOption = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  city: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
};

export type PrescriptionOffer = {
  id: string;
  pharmacy_id: string;
  distance_km: number | null;
  status: string;
  round_number: number;
  created_at: string;
  pharmacies?: PharmacyOption | PharmacyOption[] | null;
};

export type PrescriptionOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  status: string;
  created_at: string;
  fulfillment_choice: "delivery" | "pickup";
  delivery_address: string | null;
  customer_latitude: number;
  customer_longitude: number;
  search_round: number;
  search_expires_at: string | null;
  accepted_distance_km: number | null;
  order_id: string | null;
  offers: PrescriptionOffer[];
};

export type CustomerProfileUser = User;
