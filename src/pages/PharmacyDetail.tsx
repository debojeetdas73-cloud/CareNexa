import { useParams, Link, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import OrderModal from "@/components/OrderModal";
import ReviewForm from "@/components/ReviewForm";
import type { Pharmacy } from "@/data/pharmacies";
import { getPharmacyFromDatabase } from "@/lib/pharmacyData";
import type { Review } from "@/data/reviews";
import { requireSupabase } from "@/lib/supabase";
import { useState, useMemo, useEffect } from "react";
import {
  MapPin, Star, Clock, Phone, ArrowLeft, ShoppingCart, Pill, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PharmacyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [userReviews, setUserReviews] = useState<Review[]>([]);
  const [medicineSearch, setMedicineSearch] = useState(searchParams.get("medicine") || "");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    getPharmacyFromDatabase(id ?? "")
      .then((row) => { if (!cancelled) setPharmacy(row); })
      .then(async () => {
        const db = requireSupabase();
        const { data, error } = await db.from("pharmacy_reviews").select("id,pharmacy_id,author_name,rating,created_at,comment").eq("pharmacy_id", id).order("created_at", { ascending: false });
        if (error) throw error;
        if (!cancelled) setUserReviews((data ?? []).map((r) => ({ id: r.id, pharmacyId: r.pharmacy_id, author: r.author_name, rating: r.rating, date: r.created_at, comment: r.comment })));
      })
      .catch((error) => {
        console.error("Could not load pharmacy from Supabase:", error);
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load pharmacy data.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const filteredMedicines = useMemo(() => {
    if (!medicineSearch.trim()) return pharmacy?.availableMedicines || [];
    return (pharmacy?.availableMedicines || []).filter(
      (m) =>
        m.name.toLowerCase().includes(medicineSearch.toLowerCase()) ||
        m.genericName.toLowerCase().includes(medicineSearch.toLowerCase()) ||
        m.category.toLowerCase().includes(medicineSearch.toLowerCase())
    );
  }, [pharmacy, medicineSearch]);

  if (loading || !pharmacy) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto max-w-4xl px-4 py-24 text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">
            {loading ? "Loading pharmacy from database…" : loadError ? "Could not load pharmacy" : "Pharmacy not found"}
          </h1>
          {loadError && <p role="alert" className="mt-3 text-sm text-destructive">{loadError}</p>}
          {!loading && <Link to="/" className="mt-4 inline-flex items-center gap-1 text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Back to search</Link>}
        </div>
        <Footer />
      </div>
    );
  }

  const allReviews = userReviews;
  const avgRating = allReviews.length
    ? (allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length).toFixed(1)
    : pharmacy.rating.toFixed(1);
  const ratingSummary = allReviews.length ? `${avgRating} (${allReviews.length} review${allReviews.length === 1 ? "" : "s"})` : "No reviews yet";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero banner */}
      <section className="bg-gradient-to-br from-primary to-[hsl(var(--hero-gradient-to))] px-4 pb-12 pt-24 md:pb-16 md:pt-32">
        <div className="container mx-auto max-w-4xl">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary-foreground/70 transition-colors hover:text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to search
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-3xl font-extrabold text-primary-foreground md:text-4xl">
                  {pharmacy.name}
                </h1>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${pharmacy.openNow
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-destructive/80 text-destructive-foreground"
                    }`}
                >
                  {pharmacy.openNow ? "Open" : "Closed"}
                </span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-primary-foreground/80">
                <MapPin className="h-4 w-4" /> {pharmacy.address}
              </p>
            </div>

            <Button
              variant="hero"
              size="xl"
              disabled={!pharmacy.openNow}
              onClick={() => setOrderOpen(true)}
            >
              <ShoppingCart className="h-5 w-5" />
              Order Now
            </Button>
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-4xl px-4 py-12">
        {/* Info cards row */}
        <div className="grid gap-4 sm:grid-cols-3">
          <InfoCard icon={<Star className="h-5 w-5 fill-accent text-accent" />} label="Rating" value={ratingSummary} />
          <InfoCard icon={<Clock className="h-5 w-5 text-primary" />} label="Hours" value={pharmacy.hours} />
          <InfoCard icon={<Phone className="h-5 w-5 text-primary" />} label="Phone" value={pharmacy.phone} />
        </div>

        {/* Full Inventory */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Pill className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold text-foreground">
              Full Inventory ({filteredMedicines.length} of {pharmacy.availableMedicines.length} medicines)
            </h2>
          </div>

          {/* Search filter */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search medicines by name, generic name, or category..."
              value={medicineSearch}
              onChange={(e) => setMedicineSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredMedicines.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No medicines found matching "{medicineSearch}"</p>
          ) : (
            <div className="grid gap-3 max-h-[600px] overflow-y-auto">
              {filteredMedicines.map((m) => (
                <div
                  key={m.name}
                  className="rounded-lg border border-border/50 bg-secondary/30 p-3 hover:bg-secondary/50 hover:border-primary/30 transition-all cursor-pointer group"
                  onClick={() => setMedicineSearch(m.name)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{m.name}</h3>
                      <p className="text-xs text-muted-foreground">Generic: {m.genericName}</p>
                    </div>
                    <span className="rounded-md bg-primary/8 px-2 py-1 text-xs font-medium text-primary w-fit">
                      {m.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact details */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-foreground">Contact Information</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              {pharmacy.address}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 text-primary" />
              {pharmacy.phone}
            </p>
          </div>
        </div>

        {/* Reviews */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-accent text-accent" />
            <h2 className="font-display text-lg font-bold text-foreground">
              Customer Reviews ({allReviews.length})
            </h2>
          </div>

          {allReviews.length === 0 ? (
            <p className="mt-4 text-muted-foreground">No reviews yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {allReviews.map((r) => (
                <div key={r.id} className="rounded-xl bg-secondary/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground">{r.author}</p>
                    <time className="text-xs text-muted-foreground">{r.date}</time>
                  </div>
                  <div className="mt-1 flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${i < r.rating ? "fill-accent text-accent" : "text-muted-foreground/30"
                          }`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>
                </div>
              ))}
            </div>
          )}

          <ReviewForm
            pharmacyId={pharmacy.id}
            onSubmit={async (review) => {
              const db = requireSupabase();
              const { data: auth } = await db.auth.getUser();
              if (!auth.user) throw new Error("Please sign in to submit a review.");
              const { data, error } = await db.from("pharmacy_reviews").insert({
                pharmacy_id: pharmacy.id, user_id: auth.user.id, author_name: review.author,
                rating: review.rating, comment: review.comment
              }).select("id,pharmacy_id,author_name,rating,created_at,comment").single();
              if (error) throw error;
              setUserReviews((prev) => [{ id: data.id, pharmacyId: data.pharmacy_id, author: data.author_name, rating: data.rating, date: data.created_at, comment: data.comment }, ...prev]);
            }}
          />
        </div>
      </div>

      <Footer />

      {orderOpen && (
        <OrderModal pharmacy={pharmacy} onClose={() => setOrderOpen(false)} />
      )}
    </div>
  );
};

const InfoCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
    <div className="flex items-center gap-2">
      {icon}
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
    <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
  </div>
);

export default PharmacyDetail;
