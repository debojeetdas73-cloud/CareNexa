// Review data is fetched from Supabase; no hard-coded demo reviews.
export interface Review {
  id: string;
  pharmacyId: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
}
