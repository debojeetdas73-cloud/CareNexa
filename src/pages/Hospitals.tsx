import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, MapPin, Search, Star, Phone, ArrowRight, Loader2, Stethoscope } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { requireSupabase } from "@/lib/supabase";

type Doctor = { id: string; hospital_id: string; name: string; specialty: string | null; qualification?: string | null; experience?: string | null; };
type Hospital = {
  id: string; name: string; city: string; district: string; state: string; address: string;
  phone: string | null; image_url: string | null; banner_url?: string | null;
  rating: number | null; review_count: number | null; departments: string[] | null;
  hospital_type: string | null; doctors?: Doctor[]; embedded_doctors?: { name?: string; specialty?: string }[] | null;
};

export default function Hospitals() {
  const [rows, setRows] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [specialty, setSpecialty] = useState("all");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const supabase = requireSupabase();
        const { data, error } = await supabase.from("hospitals")
          .select("id,name,city,district,state,address,phone,image_url,banner_url,rating,review_count,departments,hospital_type,doctors")
          .eq("status", "approved").order("name");
        if (error) throw error;
        const hospitals = (data || []) as Hospital[];
        const ids = hospitals.map(h => h.id);
        let doctors: Doctor[] = [];
        if (ids.length) {
          const result = await supabase.from("hospital_doctors")
            .select("id,hospital_id,name,specialty,qualification,experience")
            .in("hospital_id", ids).eq("is_active", true);
          // Older installations may not have run the expanded directory migration yet.
          if (!result.error) doctors = (result.data || []) as Doctor[];
        }
        if (active) setRows(hospitals.map(h => ({
          ...h,
          doctors: doctors.filter(d => d.hospital_id === h.id),
          embedded_doctors: Array.isArray(h.doctors) ? h.doctors : [],
        })));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unable to load hospitals.");
      } finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, []);

  const cities = useMemo(() => [...new Set(rows.map(h => h.city).filter(Boolean))].sort(), [rows]);
  const specializations = useMemo(() => [...new Set(rows.flatMap(h => [
    ...(h.departments || []),
    ...(h.doctors || []).map(d => d.specialty || ""),
    ...(h.embedded_doctors || []).map(d => d.specialty || ""),
  ]).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);

  const filtered = useMemo(() => rows.filter(h => {
    const doctors = h.doctors || [];
    const oldDoctors = h.embedded_doctors || [];
    const matchesSpecialty = specialty === "all" ||
      (h.departments || []).some(d => d.toLowerCase() === specialty.toLowerCase()) ||
      doctors.some(d => (d.specialty || "").toLowerCase() === specialty.toLowerCase()) ||
      oldDoctors.some(d => (d.specialty || "").toLowerCase() === specialty.toLowerCase());
    const haystack = `${h.name} ${h.city} ${h.district} ${h.state} ${(h.departments || []).join(" ")} ${doctors.map(d => `${d.name} ${d.specialty}`).join(" ")} ${oldDoctors.map(d => `${d.name} ${d.specialty}`).join(" ")}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (city === "all" || h.city === city) && matchesSpecialty;
  }), [rows, query, city, specialty]);

  return <div className="min-h-screen bg-[#f7faf8]"><Navbar />
    <section className="bg-gradient-to-br from-[#168f7e] to-[#126d68] px-4 py-14 text-white sm:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[.12em] text-white/75">CareNexa healthcare directory</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Find the right hospital</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/85">Explore hospitals, departments, specialists, health packages and services in one place.</p>
        <div className="mt-8 grid max-w-5xl gap-3 rounded-2xl bg-white p-3 shadow-xl sm:grid-cols-[minmax(0,1fr)_190px_230px]">
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-4 text-slate-500"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search hospital, doctor or department..." className="w-full bg-transparent text-sm text-slate-900 outline-none" /></label>
          <select aria-label="Filter by city" value={city} onChange={e => setCity(e.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"><option value="all">All cities</option>{cities.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <select aria-label="Filter by specialization" value={specialty} onChange={e => setSpecialty(e.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"><option value="all">All specializations</option>{specializations.map(s => <option key={s} value={s}>{s}</option>)}</select>
        </div>
      </div>
    </section>
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between"><div><h2 className="font-display text-2xl font-bold text-slate-900">Hospitals near you</h2><p className="mt-1 text-sm text-slate-500">{loading ? "Loading directory..." : `${filtered.length} matching hospitals`}</p></div><Link to="/" className="text-sm font-semibold text-[#087b69]">Find medicines <ArrowRight className="ml-1 inline" size={15} /></Link></div>
      {loading ? <div className="flex items-center justify-center gap-2 py-20 text-slate-500"><Loader2 className="animate-spin" />Loading hospitals...</div>
        : error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Could not load hospitals: {error}. Check the Supabase hospital directory migration and RLS policies.</div>
          : !filtered.length ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Building2 className="mx-auto text-[#168f7e]" size={34} /><h3 className="mt-3 font-semibold text-slate-900">No hospitals found</h3><p className="mt-1 text-sm text-slate-500">Try another search, city or specialization.</p></div>
            : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(h => <article key={h.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
              <Link to={`/hospitals/${h.id}`} className="group block">
                <div className="relative h-48 overflow-hidden bg-gradient-to-br from-[#d7eee8] to-[#eff6f3]">{h.banner_url || h.image_url ? <img src={h.banner_url || h.image_url || ""} alt={`${h.name} cover`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center"><Building2 size={48} className="text-[#168f7e]/60" /></div>}<div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" /><span className="absolute bottom-3 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">{h.hospital_type || "Hospital"}</span></div>
                <div className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-display text-lg font-bold text-slate-900">{h.name}</h3>{h.rating != null && <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-slate-700"><Star size={14} className="fill-amber-400 text-amber-400" />{Number(h.rating).toFixed(1)}</span>}</div>
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-500"><MapPin size={15} className="mt-0.5 shrink-0" />{h.address}, {h.city}, {h.state}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{(h.departments || []).slice(0, 3).map(d => <span key={d} className="rounded-full bg-[#e9f5f1] px-2.5 py-1 text-[11px] font-medium text-[#176d5b]">{d}</span>)}</div>
                </div>
              </Link>
              {h.doctors?.length ? <div className="px-5 pb-3 text-xs text-slate-500"><Stethoscope size={13} className="mr-1 inline" />{h.doctors.length} listed specialists</div> : null}
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">{h.phone && <a href={`tel:${h.phone}`} className="flex items-center gap-1.5 text-sm text-slate-600"><Phone size={14} />{h.phone}</a>}<Link to={`/hospitals/${h.id}`} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#168f7e] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#117365]">View details <ArrowRight size={14} /></Link></div>
            </article>)}</div>}
    </main><Footer /></div>;
}
