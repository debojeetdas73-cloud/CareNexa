
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft, CheckCircle2, Clock, Phone, ShieldCheck
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { requireSupabase } from "@/lib/supabase";

type HealthPackage = {
    id: string;
    hospital_id: string;
    name: string;
    short_description: string | null;
    description: string | null;
    price: number | null;
    original_price: number | null;
    image_url: string | null;
    tests_included: string[] | null;
    services_included: string[] | null;
    preparation_instructions: string | null;
    duration: string | null;
    fasting_required: boolean | null;
};

type Hospital = {
    id: string;
    name: string;
    city: string;
    state: string;
    phone: string | null;
    address: string;
};

export default function HospitalPackageDetail() {
    const { hospitalId, packageId } = useParams();

    const [pkg, setPkg] = useState<HealthPackage | null>(null);
    const [hospital, setHospital] = useState<Hospital | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;

        async function loadPackage() {
            try {
                const sb = requireSupabase();

                const [p, h] = await Promise.all([
                    sb.from("hospital_packages")
                        .select("*")
                        .eq("id", packageId)
                        .eq("hospital_id", hospitalId)
                        .eq("is_active", true)
                        .maybeSingle(),

                    sb.from("hospitals")
                        .select("id,name,city,state,phone,address")
                        .eq("id", hospitalId)
                        .eq("status", "approved")
                        .maybeSingle()
                ]);

                if (p.error) throw p.error;
                if (h.error) throw h.error;

                if (active) {
                    setPkg(p.data as HealthPackage | null);
                    setHospital(h.data as Hospital | null);
                }
            } catch (e) {
                if (active) {
                    setError(
                        e instanceof Error
                            ? e.message
                            : "Unable to load package."
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        loadPackage();

        return () => {
            active = false;
        };
    }, [hospitalId, packageId]);

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
                        Loading package...
                    </p>
                ) : error || !pkg || !hospital ? (
                    <div className="rounded-xl border border-red-200 bg-white p-8 text-center text-sm text-red-700">
                        {error || "Package not found."}
                    </div>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="space-y-5">
                            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                {pkg.image_url ? (
                                    <img
                                        src={pkg.image_url}
                                        alt={pkg.name}
                                        className="h-64 w-full object-cover"
                                    />
                                ) : (
                                    <div className="grid h-48 place-items-center bg-gradient-to-br from-[#d7eee8] to-[#eff6f3] text-[#168f7e]">
                                        <ShieldCheck size={56} />
                                    </div>
                                )}

                                <div className="p-6">
                                    <p className="text-xs font-bold uppercase tracking-wider text-[#168f7e]">
                                        Hospital health package
                                    </p>

                                    <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900">
                                        {pkg.name}
                                    </h1>

                                    <p className="mt-3 text-sm leading-7 text-slate-600">
                                        {pkg.description ||
                                            pkg.short_description ||
                                            "Contact the hospital for complete package information."}
                                    </p>

                                    <p className="mt-4 text-sm text-slate-500">
                                        Provided by{" "}
                                        <Link
                                            to={`/hospitals/${hospital.id}`}
                                            className="font-semibold text-[#087b69]"
                                        >
                                            {hospital.name}
                                        </Link>
                                    </p>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                                <h2 className="text-xl font-bold text-slate-900">
                                    Tests included
                                </h2>

                                {pkg.tests_included?.length ? (
                                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                                        {pkg.tests_included.map((x) => (
                                            <li
                                                key={x}
                                                className="flex items-start gap-2 text-sm text-slate-600"
                                            >
                                                <CheckCircle2
                                                    size={16}
                                                    className="mt-0.5 shrink-0 text-[#168f7e]"
                                                />
                                                {x}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-3 text-sm text-slate-500">
                                        The hospital has not listed individual tests.
                                    </p>
                                )}
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                                <h2 className="text-xl font-bold text-slate-900">
                                    Services included
                                </h2>

                                {pkg.services_included?.length ? (
                                    <ul className="mt-4 space-y-2">
                                        {pkg.services_included.map((x) => (
                                            <li
                                                key={x}
                                                className="flex gap-2 text-sm text-slate-600"
                                            >
                                                <CheckCircle2 size={16} className="text-[#168f7e]" />
                                                {x}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-3 text-sm text-slate-500">
                                        No additional services listed.
                                    </p>
                                )}
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                                <h2 className="text-xl font-bold text-slate-900">
                                    Preparation instructions
                                </h2>

                                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
                                    {pkg.preparation_instructions ||
                                        "Please contact the hospital to confirm preparation requirements before your visit."}
                                </p>
                            </section>
                        </div>

                        <aside>
                            <section className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <p className="text-sm text-slate-500">
                                    Package price
                                </p>

                                <div className="mt-1 flex items-baseline gap-2">
                                    {pkg.price != null ? (
                                        <span className="font-display text-3xl font-extrabold text-slate-900">
                                            ₹{Number(pkg.price).toLocaleString("en-IN")}
                                        </span>
                                    ) : (
                                        <span className="text-lg font-bold text-slate-700">
                                            Contact hospital
                                        </span>
                                    )}

                                    {pkg.original_price != null &&
                                        pkg.price != null &&
                                        pkg.original_price > pkg.price && (
                                            <span className="text-sm text-slate-400 line-through">
                                                ₹{Number(pkg.original_price).toLocaleString("en-IN")}
                                            </span>
                                        )}
                                </div>

                                {pkg.duration && (
                                    <p className="mt-4 flex gap-2 text-sm text-slate-600">
                                        <Clock size={16} className="text-[#168f7e]" />
                                        Duration: {pkg.duration}
                                    </p>
                                )}

                                {pkg.fasting_required != null && (
                                    <p className="mt-3 text-sm text-slate-600">
                                        Fasting required:{" "}
                                        <strong>
                                            {pkg.fasting_required ? "Yes" : "No"}
                                        </strong>
                                    </p>
                                )}

                                <div className="mt-5 border-t pt-5">
                                    <p className="text-sm font-semibold text-slate-900">
                                        {hospital.name}
                                    </p>

                                    <p className="mt-1 text-xs text-slate-500">
                                        {hospital.address}, {hospital.city}, {hospital.state}
                                    </p>

                                    {hospital.phone && (
                                        <a
                                            href={`tel:${hospital.phone}`}
                                            className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#168f7e] px-4 py-3 text-sm font-semibold text-white"
                                        >
                                            <Phone size={16} />
                                            Contact hospital to book
                                        </a>
                                    )}

                                    <p className="mt-3 text-xs leading-5 text-slate-500">
                                        Confirm package availability, included tests and final price directly with the hospital before booking.
                                    </p>
                                </div>
                            </section>
                        </aside>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}
