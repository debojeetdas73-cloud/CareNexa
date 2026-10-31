import { requireSupabase } from "@/lib/supabase";
import type { CustomerOrder, PharmacyOption, PrescriptionOffer, PrescriptionOrder } from "./types";

export async function loadCustomerOrders(userId: string) {
  const db = requireSupabase();
  const [ordersResult, prescriptionsResult] = await Promise.all([
    db.from("orders")
      .select("id,order_number,status,created_at,final_total,discount_amount,fulfillment_choice,quote_sent_at,customer_accepted_quote_at,quote_message,prescription_order_id,pharmacies(name),order_items(quantity,medicines(name,strength))")
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false }),
    db.from("prescription_orders")
      .select("id,customer_name,customer_phone,notes,status,created_at,fulfillment_choice,delivery_address,customer_latitude,customer_longitude,search_round,search_expires_at,accepted_distance_km,order_id,offers:prescription_offers(id,pharmacy_id,distance_km,status,round_number,created_at,pharmacies(id,name,address,phone,city,district,state,latitude,longitude))")
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (ordersResult.error) throw ordersResult.error;
  if (prescriptionsResult.error) throw prescriptionsResult.error;

  const requests = (prescriptionsResult.data || []) as Array<
    Omit<PrescriptionOrder, "offers"> & { offers?: PrescriptionOffer[] | null }
  >;

  return {
    orders: (ordersResult.data || []) as CustomerOrder[],
    prescriptions: requests.map((request) => ({ ...request, offers: request.offers || [] })) as PrescriptionOrder[],
  };
}

export async function loadApprovedPharmacies() {
  const { data, error } = await requireSupabase()
    .from("pharmacies")
    .select("id,name,address,phone,city,district,state,latitude,longitude")
    .eq("is_active", true)
    .eq("verification_status", "approved")
    .order("name");

  if (error) throw error;
  return (data || []) as PharmacyOption[];
}

export const isQuotePending = (order: CustomerOrder) =>
  (order.status || "").toLowerCase() === "pending" && !!order.quote_sent_at && !order.customer_accepted_quote_at;

export const isOrderComplete = (order: CustomerOrder) =>
  ["completed", "delivered"].includes((order.status || "").toLowerCase());

export function needsPrescriptionRetry(request: PrescriptionOrder, now = Date.now()) {
  return request.status === "needs_resend"
    || (request.status === "searching" && !!request.search_expires_at && new Date(request.search_expires_at).getTime() <= now);
}

export function getPharmacyName(order: CustomerOrder) {
  return Array.isArray(order.pharmacies) ? order.pharmacies[0]?.name : order.pharmacies?.name;
}

export type { CustomerOrder, PharmacyOption, PrescriptionOrder } from "./types";
