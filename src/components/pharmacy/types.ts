export type OrderMedicine = {
    id: string;
    name: string;
    generic_name: string | null;
    brand_name: string | null;
    strength: string | null;
    dosage_form: string | null;
};

export type OrderItem = {
    id: string;
    order_id: string;
    medicine_id: string;
    quantity: number;
    unit_selling_price: number;
    line_total: number;
    medicine: OrderMedicine | null;
};

export type Order = {
    id: string;
    order_number: string | null;
    status: string;
    customer_name: string;
    customer_phone: string;
    subtotal: number;
    final_total: number | null;
    discount_amount: number | null;
    created_at: string;
    fulfillment_choice: string | null;
    delivery_address: string | null;
    quote_sent_at: string | null;
    customer_accepted_quote_at: string | null;
    quote_message: string | null;
    prescription_order_id: string | null;
    completed_at: string | null;
    items: OrderItem[];
};

export type InventoryMedicine = {
    medicine_id: string;
    medicine_name: string;
    generic_name?: string | null;
    brand_name?: string | null;
    category?: string | null;
    strength?: string | null;
    dosage_form?: string | null;
    pack_size?: string | null;
    quantity_on_hand: number;
    reorder_level: number;
    average_purchase_cost: number;
    selling_price: number;
    nearest_expiry?: string | null;
    is_low_stock?: boolean;
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
    accepted_distance_km: number | null;
    order_id: string | null;
    storage_path: string;
    signed_url: string | null;
};

export type PrescriptionOffer = {
    id: string;
    prescription_order_id: string;
    pharmacy_id: string;
    round_number: number;
    distance_km: number | null;
    fulfillment_choice: "delivery" | "pickup";
    status: string;
    expires_at: string;
    created_at: string;
};

export type PharmacyRecord = {
    id: string;
    name: string;
    phone: string | null;
    address: string;
    city: string;
    district: string;
    state: string;
    verification_status: string | null;
    is_active: boolean;
};
