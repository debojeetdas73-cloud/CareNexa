import { requireSupabase } from "@/lib/supabase";

export async function placeOnlineOrder(input: {
  pharmacyId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  fulfillment: "delivery" | "pickup";
  items: Array<{ medicineId: string; quantity: number }>;
}) {
  const db = requireSupabase();
  const { data, error } = await db.rpc("place_pharmacy_order", {
    p_pharmacy_id: input.pharmacyId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_delivery_address: input.deliveryAddress,
    p_fulfillment: input.fulfillment,
    p_items: input.items.map((item) => ({
      medicine_id: item.medicineId,
      quantity: item.quantity,
    })),
  });
  if (error) throw error;
  return data as string;
}
