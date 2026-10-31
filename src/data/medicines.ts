// Medicine records are loaded from Supabase at runtime.
// This file intentionally contains types only; do not add a static medicine catalogue here.
export interface Medicine {
  id?: string;
  name: string;
  genericName: string;
  category: string;
  brandName?: string | null;
  manufacturer?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  packSize?: string | null;
  prescriptionRequired?: boolean;
  hasStock?: boolean;
  inventoryMedicineIds?: string[];
  quantityOnHand?: number;
  sellingPrice?: number;
  purchaseCost?: number;
}
