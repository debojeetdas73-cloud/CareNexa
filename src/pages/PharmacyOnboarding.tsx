import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { requireSupabase } from "@/lib/supabase";
import { getCurrentLocation, type Coordinates } from "@/lib/geolocation";

type PharmacyForm = {
  name: string;
  phone: string;
  address: string;
  state: string;
  district: string;
  city: string;
  pincode: string;
  openingTime: string;
  closingTime: string;
  is24Hours: boolean;
};

const emptyForm: PharmacyForm = {
  name: "",
  phone: "",
  address: "",
  state: "",
  district: "",
  city: "",
  pincode: "",
  openingTime: "09:00",
  closingTime: "21:00",
  is24Hours: false,
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-input bg-background p-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function isMissingRegistrationRpc(cause: unknown) {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { code?: unknown; status?: unknown; message?: unknown };
  const message = typeof error.message === "string" ? error.message : "";
  return error.code === "PGRST202" ||
    error.status === 404 ||
    /could not find the function.*register_pharmacy/i.test(message);
}

export default function PharmacyOnboarding() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState("");
  const [error, setError] = useState("");
  const [databaseSetupNeeded, setDatabaseSetupNeeded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const db = requireSupabase();
        const { data: { session }, error: authError } = await db.auth.getSession();
        if (authError) throw authError;
        if (!session?.user) {
          navigate("/account", { replace: true });
          return;
        }

        const { data: pharmacy, error: pharmacyError } = await db
          .from("pharmacies")
          .select("id")
          .eq("owner_user_id", session.user.id)
          .maybeSingle();
        if (pharmacyError) throw pharmacyError;
        if (pharmacy) {
          navigate("/pharmacy-dashboard", { replace: true });
          return;
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load pharmacy setup.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  const update = (key: keyof PharmacyForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function detectLocation() {
    setLocating(true);
    setLocationError("");
    try {
      setLocation(await getCurrentLocation());
    } catch (cause) {
      setLocationError(cause instanceof Error ? cause.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) {
      setLocationError("Detect the pharmacy's GPS location before submitting.");
      return;
    }
    setBusy(true);
    setError("");
    setDatabaseSetupNeeded(false);
    try {
      const db = requireSupabase();
      const { data: { session }, error: authError } = await db.auth.getSession();
      if (authError) throw authError;
      if (!session?.user) {
        navigate("/account", { replace: true });
        return;
      }

      const { error: registerError } = await db.rpc("register_pharmacy", {
        p_name: form.name.trim(),
        p_phone: form.phone.trim(),
        p_email: session.user.email ?? "",
        p_address: form.address.trim(),
        p_state: form.state.trim(),
        p_district: form.district.trim(),
        p_city: form.city.trim(),
        p_pincode: form.pincode.trim() || null,
        p_opening_time: form.is24Hours ? null : form.openingTime,
        p_closing_time: form.is24Hours ? null : form.closingTime,
        p_is_24_hours: form.is24Hours,
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_latitude_accuracy_m: location.accuracy ?? null,
      });
      if (registerError) throw registerError;
      navigate("/pharmacy-dashboard", { replace: true });
    } catch (cause) {
      if (isMissingRegistrationRpc(cause)) {
        setDatabaseSetupNeeded(true);
        setError("Supabase cannot find the pharmacy registration function. The required database migration has not been applied to this project yet, or its API schema cache needs refreshing.");
      } else {
        setError(cause instanceof Error ? cause.message : "Could not save the pharmacy details.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-background px-4 py-12 text-center text-muted-foreground">Checking your pharmacy setup…</main>;
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 shadow-sm md:p-9">
        <Link to="/" className="text-sm text-primary">← CareNexa</Link>
        <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-primary">Pharmacy partner setup · Step 1 of 1</p>
        <h1 className="mt-2 text-3xl font-bold">Tell us about your pharmacy</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Submit your shop and contact details to create a pending pharmacy profile. It stays hidden from customers until an administrator verifies and approves it.
        </p>

        {error && (
          <div role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{error}</p>
            {databaseSetupNeeded && (
              <div className="mt-3 space-y-2">
                <p>In Supabase Dashboard → SQL Editor, apply the project migrations in order, including:</p>
                <code className="block rounded bg-background p-2 text-xs text-foreground">supabase/migrations/202610080001_pharmacy_customer_geolocation.sql</code>
                <p>That migration installs the GPS-enabled <code>register_pharmacy</code> RPC. After it succeeds, reload the Supabase API schema cache (Project Settings → API → Reload schema cache), then retry this form.</p>
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Pharmacy name
              <input required maxLength={160} value={form.name} onChange={(e) => update("name", e.target.value)} className={fieldClass} />
            </label>
            <label className="text-sm font-medium">Contact phone
              <input required type="tel" maxLength={30} value={form.phone} onChange={(e) => update("phone", e.target.value)} className={fieldClass} />
            </label>
            <label className="text-sm font-medium">Pincode
              <input inputMode="numeric" pattern="[0-9]{6}" title="Enter a 6-digit pincode" value={form.pincode} onChange={(e) => update("pincode", e.target.value)} className={fieldClass} />
            </label>
            <label className="text-sm font-medium sm:col-span-2">Street address
              <input required maxLength={240} value={form.address} onChange={(e) => update("address", e.target.value)} className={fieldClass} />
            </label>
            <label className="text-sm font-medium">City
              <input required maxLength={100} value={form.city} onChange={(e) => update("city", e.target.value)} className={fieldClass} />
            </label>
            <label className="text-sm font-medium">District
              <input required maxLength={100} value={form.district} onChange={(e) => update("district", e.target.value)} className={fieldClass} />
            </label>
            <label className="text-sm font-medium sm:col-span-2">State
              <input required maxLength={100} value={form.state} onChange={(e) => update("state", e.target.value)} className={fieldClass} />
            </label>
          </div>

          <section className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Pharmacy GPS location</h2>
                <p className="mt-1 text-sm text-muted-foreground">Allow location access while at the pharmacy so customers can find it nearby.</p>
              </div>
              <button type="button" disabled={locating} onClick={detectLocation} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
                <MapPin size={16} />{locating ? "Detecting…" : location ? "Refresh location" : "Use current location"}
              </button>
            </div>
            {location && (
              <p role="status" className="mt-3 text-sm text-emerald-700">
                Location captured: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                {location.accuracy ? ` (accuracy ±${Math.round(location.accuracy)} m)` : ""}
              </p>
            )}
            {locationError && <p role="alert" className="mt-3 text-sm text-destructive">{locationError}</p>}
            <p className="mt-2 text-xs text-muted-foreground">GPS coordinates are saved with the pharmacy details. City and street address above are still needed for delivery and customer directions.</p>
          </section>

          <fieldset className="rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Business hours</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is24Hours} onChange={(e) => update("is24Hours", e.target.checked)} />
              Open 24 hours
            </label>
            {!form.is24Hours && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Opening time
                  <input required type="time" value={form.openingTime} onChange={(e) => update("openingTime", e.target.value)} className={fieldClass} />
                </label>
                <label className="text-sm font-medium">Closing time
                  <input required type="time" value={form.closingTime} onChange={(e) => update("closingTime", e.target.value)} className={fieldClass} />
                </label>
              </div>
            )}
          </fieldset>

          <p className="text-xs leading-5 text-muted-foreground">
            Do not enter Aadhaar or upload identity documents here. Secure document verification must be completed separately with the administrator.
          </p>
          <button disabled={busy || !location} className="w-full rounded-lg bg-primary p-3 font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Submitting pharmacy details…" : "Submit for verification"}
          </button>
        </form>
      </section>
    </main>
  );
}
