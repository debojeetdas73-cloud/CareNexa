import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, MapPin, Search, Star, Phone, ArrowRight, Loader2, Stethoscope, LocateFixed } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AIAssistant from "@/components/ai/AIAssistant";
import { requireSupabase } from "@/lib/supabase";
import { distanceInKm, getCurrentLocation, isWithinDistance, type Coordinates } from "@/lib/geolocation";

type Doctor = { id: string; hospital_id: string; name: string; specialty: string | null; qualification?: string | null; experience?: string | null; };
type Hospital = {
  id: string; name: string; city: string; district: string; state: string; address: string;
  phone: string | null; image_url: string | null; banner_url?: string | null;
  rating: number | null; review_count: number | null; departments: string[] | null;
  hospital_type: string | null; doctors?: Doctor[]; embedded_doctors?: { name?: string; specialty?: string }[] | null;
  latitude: number | null; longitude: number | null; distance?: number;
};

export default function Hospitals() {
  const [rows, setRows] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationPending, setLocationPending] = useState(true);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [radius, setRadius] = useState("50");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const supabase = requireSupabase();
        const { data, error } = await supabase.from("hospitals")
          .select("id,name,city,district,state,address,phone,image_url,banner_url,rating,review_count,departments,hospital_type,doctors,latitude,longitude")
          .eq("status", "approved").order("name");
        if (error) throw error;
        const hospitals = (data || []) as Hospital[];
        const ids = hospitals.map(h => h.id);
        let doctors: Doctor[] = [];
        if (ids.length) {
          const result = await supabase.from("hospital_doctors")
            .select("id,hospital_id,name,specialty,qualification,experience")
            .in("hospital_id", ids).eq("is_active", true);
          if (!result.error) doctors = (result.data || []) as Doctor[];
        }
        if (active) setRows(hospitals.map(h => ({
          ...h,
          doctors: doctors.filter(d => d.hospital_id === h.id),
          embedded_doctors: Array.isArray(h.doctors) ? h.doctors : [],
        })));
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : "Unable to load hospitals.");
      } finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLocationError(null);
    setUserLocation(null);
    setLocationPending(true);
    void getCurrentLocation({ maximumAge: 0 })
      .then(location => {
        if (active) setUserLocation(location);
      })
      .catch((e: unknown) => {
        if (active) {
          setLocationError(e instanceof Error ? e.message : "Location detection failed.");
        }
      })
      .finally(() => {
        if (active) setLocationPending(false);
      });
    return () => { active = false; };
  }, [locationAttempt]);

  const cities = useMemo(() => [...new Set(rows.map(h => h.city).filter(Boolean))].sort(), [rows]);
  const specializations = useMemo(() => [...new Set(rows.flatMap(h => [
    ...(h.departments || []),
    ...(h.doctors || []).map(d => d.specialty || ""),
    ...(h.embedded_doctors || []).map(d => d.specialty || ""),
  ]).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);

  const filteredWithDistance = useMemo(() => {
    const maxDistanceKm = radius === "all" ? null : Number(radius);
    const searchText = query.trim().toLowerCase();
    const withDistance = rows.map(h => {
      const distance = userLocation && h.latitude != null && h.longitude != null
        ? distanceInKm(userLocation, { latitude: h.latitude, longitude: h.longitude })
        : null;
      return { ...h, distance: distance ?? undefined };
    });

    const filtered = withDistance.filter(h => {
      const doctors = h.doctors || [];
      const oldDoctors = h.embedded_doctors || [];
      const matchesSpecialty = specialty === "all" ||
        (h.departments || []).some(d => d.toLowerCase() === specialty.toLowerCase()) ||
        doctors.some(d => (d.specialty || "").toLowerCase() === specialty.toLowerCase()) ||
        oldDoctors.some(d => (d.specialty || "").toLowerCase() === specialty.toLowerCase());
      const matchesCity = city === "all" || h.city === city;
      const matchesQuery = !searchText || [
        h.name,
        h.city,
        h.district,
        h.state,
        h.address,
        ...(h.departments || []),
        ...doctors.flatMap(d => [d.name, d.specialty || "", d.qualification || ""]),
        ...oldDoctors.flatMap(d => [d.name || "", d.specialty || ""]),
      ].some(value => value.toLowerCase().includes(searchText));
      const matchesRadius = !userLocation || isWithinDistance(h.distance, maxDistanceKm);
      return matchesSpecialty && matchesCity && matchesQuery && matchesRadius;
    });

    if (userLocation) {
      filtered.sort((a, b) => {
        if (a.distance != null && b.distance != null) return a.distance - b.distance;
        if (a.distance != null) return -1;
        if (b.distance != null) return 1;
        return a.name.localeCompare(b.name);
      });
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    return filtered;
  }, [rows, query, city, specialty, userLocation, radius]);

  return (
    <div className="min-h-screen bg-[#f7faf8]">
      <Navbar />
      <section className="bg-gradient-to-br from-[#168f7e] to-[#126d68] px-4 py-14 text-white sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-bold mb-2">Find the right hospital</h2>
          <p className="text-slate-200 text-sm">Explore hospitals, departments, specialists, health packages and services in one place.</p>
          <div className="mt-6 grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-5" />
              <input
                type="text"
                aria-label="Search hospitals, doctors, or departments"
                placeholder="Search hospital, doctor or department..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full rounded-xl border border-white/30 bg-white/15 py-3.5 pl-10 pr-4 text-base text-white placeholder:text-white/65 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>
            <select
              aria-label="Filter by city"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="hospital-filter w-full min-w-0 py-3.5 pl-3 pr-10 rounded-xl border border-white/30 bg-white/20 text-white placeholder-slate-400 text-base focus:outline-none focus:border-white transition-colors appearance-none cursor-pointer"
              style={{ backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", backgroundSize: "16px" }}
            >
              <option className="bg-white text-slate-900" value="all">All cities</option>
              {cities.map(c => <option className="bg-white text-slate-900" key={c} value={c}>{c}</option>)}
            </select>
            <select
              aria-label="Filter by specialization"
              value={specialty}
              onChange={e => setSpecialty(e.target.value)}
              className="hospital-filter w-full min-w-0 py-3.5 pl-3 pr-10 rounded-xl border border-white/30 bg-white/20 text-white placeholder-slate-400 text-base focus:outline-none focus:border-white transition-colors appearance-none cursor-pointer"
              style={{ backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", backgroundSize: "16px" }}
            >
              <option className="bg-white text-slate-900" value="all">All specializations</option>
              {specializations.map(s => <option className="bg-white text-slate-900" key={s} value={s}>{s}</option>)}
            </select>
            <select
              aria-label="Filter by distance"
              value={radius}
              onChange={e => setRadius(e.target.value)}
              disabled={!userLocation}
              className="hospital-filter w-full min-w-0 py-3.5 pl-3 pr-10 rounded-xl border border-white/30 bg-white/20 text-white text-base focus:outline-none focus:border-white transition-colors appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%20A0%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8c0-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", backgroundSize: "16px" }}
            >
              <option className="bg-white text-slate-900" value="25">Within 25 km</option>
              <option className="bg-white text-slate-900" value="50">Within 50 km</option>
              <option className="bg-white text-slate-900" value="100">Within 100 km</option>
              <option className="bg-white text-slate-900" value="250">Within 250 km</option>
              <option className="bg-white text-slate-900" value="all">Any distance</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-100/90">
            {userLocation ? (
              <p className="flex items-center gap-1.5">
                <MapPin size={13} />
                {radius === "all" ? "Location detected — showing closest hospitals first." : `Showing hospitals within ${radius} km of your location.`}
              </p>
            ) : locationError ? (
              <p role="status" className="flex items-center gap-1.5">
                <MapPin size={13} />
                {locationError} Showing all matching hospitals; enable location to filter by distance.
              </p>
            ) : (
              <p role="status" className="flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" />
                Detecting your location…
              </p>
            )}
            {!userLocation && locationError && (
              <button
                type="button"
                onClick={() => setLocationAttempt(attempt => attempt + 1)}
                className="inline-flex items-center gap-1 font-semibold text-white underline underline-offset-2 hover:text-white/80"
              >
                <LocateFixed size={13} /> Try again
              </button>
            )}
          </div>
        </div>
      </section>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              {userLocation ? "Hospitals near you" : "Hospital directory"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {loading || locationPending ? "Loading directory&hellip;" : userLocation && radius !== "all" ? `${filteredWithDistance.length} hospitals within ${radius} km` : `${filteredWithDistance.length} matching hospitals`}
            </p>
          </div>
          <Link to="/" className="text-sm font-semibold text-[#087b69]">Find medicines <ArrowRight className="ml-1 inline" size={15} /></Link>
        </div>
        {loading || locationPending ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500"><Loader2 className="animate-spin" />Loading hospitals&hellip;</div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Could not load hospitals: {error}. Check the Supabase hospital directory migration and RLS policies.</div>
        ) : !filteredWithDistance.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Building2 className="mx-auto text-[#168f7e]" size={34} /><h3 className="mt-3 font-semibold text-slate-900">No hospitals found</h3><p className="mt-1 text-sm text-slate-500">{userLocation && radius !== "all" ? `No hospitals with coordinates were found within ${radius} km. Increase the distance filter or choose any distance.` : "Try another search, city or specialization."}</p></div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredWithDistance.map(h => (
              <article key={h.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <Link to={`/hospitals/${h.id}`} className="group block">
                  <div className="relative h-48 overflow-hidden bg-gradient-to-br from-[#d7eee8] to-[#eff6f3]">
                    {h.banner_url || h.image_url ? (
                      <img src={h.banner_url || h.image_url || ""} alt={`${h.name} cover`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="grid h-full place-items-center"><Building2 size={48} className="text-[#168f7e]/60" /></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />
                    <span className="absolute bottom-3 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">{h.hospital_type || "Hospital"}</span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-lg font-bold text-slate-900">{h.name}</h3>
                      {h.rating != null && <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-slate-700"><Star size={14} className="fill-amber-400 text-amber-400" />{Number(h.rating).toFixed(1)}</span>}
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-500"><MapPin size={15} className="mt-0.5 shrink-0" />{h.address}, {h.city}, {h.state}</p>
                    {h.distance != null && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#168f7e]">
                        <MapPin size={12} className="mt-0.5" /> {h.distance.toFixed(1)} km away
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(h.departments || []).slice(0, 3).map(d => (
                        <span key={d} className="rounded-full bg-[#e9f5f1] px-2.5 py-1 text-[11px] font-medium text-[#176d5b]">{d}</span>
                      ))}
                    </div>
                  </div>
                </Link>
                {h.doctors?.length ? <div className="px-5 pb-3 text-xs text-slate-500"><Stethoscope size={13} className="mr-1 inline" />{h.doctors.length} listed specialists</div> : null}
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                  {h.phone && <a href={`tel:${h.phone}`} className="flex items-center gap-1.5 text-sm text-slate-600"><Phone size={14} />{h.phone}</a>}
                  <Link to={`/hospitals/${h.id}`} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#168f7e] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#117365]">View details <ArrowRight size={14} /></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <AIAssistant />
      <Footer />
    </div>
  );
}
