
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft, Award, CalendarDays, Clock, Languages,
    MapPin, Phone, Stethoscope
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { requireSupabase } from "@/lib/supabase";

type Doctor = {
    id: string;
    hospital_id: string;
    name: string;
    specialty: string | null;
    qualification: string | null;
    experience: string | null;
    consultation_fee: number | null;
    bio: string | null;
    image_url: string | null;
    areas_of_expertise: string[] | null;
    languages: string[] | null;
    available_slots: unknown;
};

type Hospital = {
    id: string;
    name: string;
    city: string;
    state: string;
    address: string;
    phone: string | null;
};

export default function DoctorProfile() {
    const { hospitalId, doctorId } = useParams();

    const [doctor, setDoctor] = useState<Doctor | null>(null);
    const [hospital, setHospital] = useState<Hospital | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;

        async function loadDoctor() {
            try {
                const sb = requireSupabase();

                const [d, h] = await Promise.all([
                    sb.from("hospital_doctors")
                        .select("*")
                        .eq("id", doctorId)
                        .eq("hospital_id", hospitalId)
                        .eq("is_active", true)
                        .maybeSingle(),

                    sb.from("hospitals")
                        .select("id,name,city,state,address,phone")
                        .eq("id", hospitalId)
                        .eq("status", "approved")
                        .maybeSingle()
                ]);

                if (d.error) throw d.error;
                if (h.error) throw h.error;

                if (active) {
                    setDoctor(d.data as Doctor | null);
                    setHospital(h.data as Hospital | null);
                }
            } catch (e) {
                if (active) {
                    setError(
                        e instanceof Error
                            ? e.message
                            : "Unable to load doctor profile."
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        loadDoctor();

        return () => {
            active = false;
        };
    }, [hospitalId, doctorId]);

    const slots = Array.isArray(doctor?.available_slots)
        ? doctor.available_slots as (
            string | { day?: string; time?: string }
        )[]
        : [];

    return (
        <div className="min-h-screen bg-[#f7faf8]">
            <Navbar />

            <main className="mx-auto max-w-5xl px-4 py-8">
                <Link
                    to={`/hospitals/${hospitalId}`}
                    className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#087b69]"
                >
                    <ArrowLeft size={16} />
                    Back to hospital
                </Link>

                {loading ? (
                    <p className="py-20 text-center text-slate-500">
                        Loading doctor profile...
                    </p>
                ) : error || !doctor || !hospital ? (
                    <div className="rounded-xl border border-red-200 bg-white p-8 text-center text-sm text-red-700">
                        {error || "Doctor profile not found."}
                    </div>
                ) : (
                    <div className="space-y-5">
                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="h-28 bg-gradient-to-r from-[#168f7e] to-[#174f58]" />

                            <div className="px-6 pb-6">
                                <div className="-mt-14 flex flex-col gap-4 sm:flex-row sm:items-end">
                                    {doctor.image_url ? (
                                        <img
                                            src={doctor.image_url}
                                            alt={doctor.name}
                                            className="h-28 w-28 rounded-2xl border-4 border-white object-cover shadow"
                                        />
                                    ) : (
                                        <div className="grid h-28 w-28 place-items-center rounded-2xl border-4 border-white bg-[#e9f5f1] text-[#168f7e] shadow">
                                            <Stethoscope size={42} />
                                        </div>
                                    )}

                                    <div className="flex-1 pb-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-[#168f7e]">
                                            Doctor profile
                                        </p>
                                        <h1 className="mt-1 font-display text-3xl font-extrabold text-slate-900">
                                            {doctor.name}
                                        </h1>
                                        <p className="mt-1 text-[#168f7e]">
                                            {doctor.specialty || "Medical specialist"}
                                        </p>
                                    </div>

                                    {doctor.consultation_fee != null && (
                                        <div className="rounded-xl bg-[#f0f5f3] px-5 py-3">
                                            <p className="text-xs text-slate-500">
                                                Consultation fee
                                            </p>
                                            <p className="text-2xl font-bold text-slate-900">
                                                ₹{Number(doctor.consultation_fee).toLocaleString("en-IN")}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                    <div className="flex gap-2 text-sm text-slate-600">
                                        <Award size={17} className="text-[#168f7e]" />
                                        {doctor.qualification || "Qualification not listed"}
                                    </div>

                                    <div className="flex gap-2 text-sm text-slate-600">
                                        <Clock size={17} className="text-[#168f7e]" />
                                        {doctor.experience || "Experience not listed"}
                                    </div>

                                    <div className="flex gap-2 text-sm text-slate-600 sm:col-span-2">
                                        <MapPin size={17} className="text-[#168f7e]" />
                                        <span>
                                            {hospital.name}, {hospital.address}, {hospital.city}, {hospital.state}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="grid gap-5 md:grid-cols-[1fr_300px]">
                            <div className="space-y-5">
                                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                                    <h2 className="text-xl font-bold text-slate-900">
                                        About the doctor
                                    </h2>
                                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
                                        {doctor.bio || "A detailed biography has not been provided by the hospital."}
                                    </p>
                                </section>

                                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                                    <h2 className="text-xl font-bold text-slate-900">
                                        Areas of expertise
                                    </h2>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {(doctor.areas_of_expertise || []).length ? (
                                            (doctor.areas_of_expertise || []).map((x) => (
                                                <span
                                                    key={x}
                                                    className="rounded-full bg-[#e9f5f1] px-3 py-2 text-sm text-[#176d5b]"
                                                >
                                                    {x}
                                                </span>
                                            ))
                                        ) : (
                                            <p className="text-sm text-slate-500">Not provided.</p>
                                        )}
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                                    <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                                        <CalendarDays size={19} />
                                        Availability
                                    </h2>

                                    {slots.length ? (
                                        <ul className="mt-3 space-y-2">
                                            {slots.map((s, i) => (
                                                <li
                                                    key={i}
                                                    className="rounded-lg bg-[#f5f8f7] px-4 py-3 text-sm text-slate-700"
                                                >
                                                    {typeof s === "string"
                                                        ? s
                                                        : [s.day, s.time].filter(Boolean).join(" · ")}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="mt-3 text-sm text-slate-500">
                                            Appointment schedule has not been published. Please contact the hospital.
                                        </p>
                                    )}
                                </section>
                            </div>

                            <aside className="space-y-5">
                                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                                    <h2 className="font-bold text-slate-900">Languages</h2>

                                    <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                                        <Languages size={17} className="text-[#168f7e]" />
                                        {doctor.languages?.length
                                            ? doctor.languages.join(", ")
                                            : "Not listed"}
                                    </p>

                                    <div className="mt-5 border-t pt-5">
                                        <p className="text-sm text-slate-500">
                                            Appointments and availability are managed by the hospital.
                                        </p>

                                        {hospital.phone && (
                                            <a
                                                href={`tel:${hospital.phone}`}
                                                className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#168f7e] px-4 py-3 text-sm font-semibold text-white"
                                            >
                                                <Phone size={16} />
                                                Contact hospital
                                            </a>
                                        )}
                                    </div>
                                </section>
                            </aside>
                        </div>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}
