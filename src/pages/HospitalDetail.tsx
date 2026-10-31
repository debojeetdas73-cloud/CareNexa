import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import HospitalLabTests from
  "@/components/hospitals/HospitalLabTests";
import {
  ArrowLeft,
  Bed,
  CalendarDays,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Star,
  Stethoscope,
  ShieldCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { requireSupabase } from "@/lib/supabase";

type LegacyDoctor = {
  name?: string | null;
  specialty?: string | null;
  qualification?: string | null;
  experience?: string | null;
  fee?: string | number | null;
  image_url?: string | null;
};

type HospitalDoctor = {
  id: string;
  hospital_id: string;
  name: string;
  specialty: string | null;
  qualification: string | null;
  experience: string | null;
  consultation_fee: number | null;
  image_url: string | null;
  is_active: boolean;
};

type HospitalPackage = {
  id: string;
  hospital_id: string;
  name: string;
  short_description: string | null;
  price: number | null;
  original_price: number | null;
  image_url: string | null;
  duration: string | null;
};

type Hospital = {
  id: string;
  name: string;
  city: string;
  district: string;
  state: string;
  address: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  image_url: string | null;
  banner_url: string | null;
  about: string | null;
  rating: number | null;
  review_count: number | null;
  bed_count: number | null;
  established_year: number | null;
  hospital_type: string | null;
  departments: string[] | null;
  facilities: string[] | null;
  services: string[] | null;
  doctors: LegacyDoctor[] | null;
  latitude: number | null;
  longitude: number | null;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="font-display text-xl font-bold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-slate-500">{children}</p>;
}

export default function HospitalDetail() {
  const { id } = useParams<{ id: string }>();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [packages, setPackages] = useState<HospitalPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [relatedInfo, setRelatedInfo] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "doctors" | "departments" | "lab-tests">("overview");

  useEffect(() => {
    let active = true;

    async function loadHospital() {
      setLoading(true);
      setError("");
      setRelatedInfo("");
      setHospital(null);
      setDoctors([]);
      setPackages([]);

      if (!id) {
        setError("Hospital ID is missing from the page URL.");
        setLoading(false);
        return;
      }

      try {
        const supabase = requireSupabase();

        // Do not add a status filter here. Supabase RLS controls which
        // hospitals the current visitor is allowed to read.
        const hospitalResult = await supabase
          .from("hospitals")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (hospitalResult.error) {
          throw hospitalResult.error;
        }

        if (!hospitalResult.data) {
          if (active) {
            setError(
              "This hospital was not found or your account does not have permission to view it."
            );
          }
          return;
        }

        const hospitalData = hospitalResult.data as Hospital;
        if (active) setHospital(hospitalData);

        // These are optional related tables. If a migration has not yet
        // been applied, the hospital's main details still remain visible.
        const [doctorResult, packageResult] = await Promise.all([
          supabase
            .from("hospital_doctors")
            .select(
              "id,hospital_id,name,specialty,qualification,experience,consultation_fee,image_url,is_active"
            )
            .eq("hospital_id", id)
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("hospital_packages")
            .select(
              "id,hospital_id,name,short_description,price,original_price,image_url,duration"
            )
            .eq("hospital_id", id)
            .eq("is_active", true)
            .order("name"),
        ]);

        if (!active) return;

        if (doctorResult.error) {
          setRelatedInfo(
            "Doctor profiles could not be loaded. Check that migration 002 has been applied and that the doctor table's SELECT policy is enabled."
          );
        } else {
          setDoctors((doctorResult.data || []) as HospitalDoctor[]);
        }

        if (packageResult.error) {
          setRelatedInfo((current) =>
            current
              ? `${current} Health packages could not be loaded; check migration 002 and package table permissions.`
              : "Health packages could not be loaded. Check migration 002 and package table permissions."
          );
        } else {
          setPackages((packageResult.data || []) as HospitalPackage[]);
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : "An unexpected error occurred while loading the hospital."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHospital();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7faf8]">
        <Navbar />
        <main className="mx-auto max-w-4xl px-4 py-24 text-center">
          <p className="text-slate-600" role="status">
            Loading hospital details…
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="min-h-screen bg-[#f7faf8]">
        <Navbar />
        <main className="mx-auto max-w-4xl px-4 py-24 text-center">
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {error ? "Could not load hospital" : "Hospital not found"}
          </h1>
          {error && (
            <p role="alert" className="mx-auto mt-3 max-w-2xl text-sm text-red-600">
              {error}
            </p>
          )}
          <Link
            to="/hospitals"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#087b69]"
          >
            <ArrowLeft size={16} />
            Back to hospitals
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const departments = Array.isArray(hospital.departments)
    ? hospital.departments
    : [];
  const facilities = Array.isArray(hospital.facilities)
    ? hospital.facilities
    : [];
  const services = Array.isArray(hospital.services) ? hospital.services : [];

  // Keep support for older records where doctors were stored in hospitals.doctors.
  const legacyDoctors = Array.isArray(hospital.doctors) ? hospital.doctors : [];
  const hasStructuredDoctors = doctors.length > 0;

  const mapQuery =
    hospital.latitude != null && hospital.longitude != null
      ? `${hospital.latitude},${hospital.longitude}`
      : [hospital.address, hospital.city, hospital.district, hospital.state]
        .filter(Boolean)
        .join(", ");
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(
    mapQuery
  )}&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    mapQuery
  )}`;

  return (
    <div className="min-h-screen bg-[#f7faf8]">
      <Navbar />

      <div className="bg-[#0d203d] px-4 py-2 text-center text-xs font-medium text-white">
        For medical emergencies, call your local emergency number or visit the
        nearest emergency department.
      </div>

      <section className="relative min-h-[300px] overflow-hidden bg-slate-800">
        {hospital.banner_url || hospital.image_url ? (
          <img
            src={hospital.banner_url || hospital.image_url || ""}
            alt={`${hospital.name} cover`}
            className="absolute inset-0 h-full w-full object-cover opacity-55"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#168f7e] to-[#173f59]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 to-slate-950/25" />
        <div className="relative mx-auto flex min-h-[300px] max-w-6xl flex-col justify-end px-4 pb-9 pt-12 text-white">
          <Link
            to="/hospitals"
            className="mb-auto inline-flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white"
          >
            <ArrowLeft size={16} />
            All hospitals
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-white/75">
              {hospital.hospital_type || "Hospital"} · {hospital.city}
            </p>
            <h1 className="mt-2 max-w-4xl font-display text-3xl font-extrabold sm:text-4xl">
              {hospital.name}
            </h1>
            <p className="mt-3 flex items-center gap-2 text-sm text-white/85">
              <MapPin size={16} />
              {[hospital.address, hospital.city, hospital.district, hospital.state]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div
          className="flex gap-2 overflow-x-auto border-b border-slate-200"
          role="tablist"
          aria-label="Hospital information"
        >
          {([
            ["overview", "Overview"],
            ["doctors", "Doctors"],
            ["departments", "Departments"],
            ["lab-tests", "Lab Tests & Packages"],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === tab
                  ? "border-[#168f7e] text-[#087b69]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-5">
          {activeTab === "overview" && (
            <>
              <Section title="About">
                <p className="text-sm leading-7 text-slate-600">
                  {hospital.about ||
                    `${hospital.name} is located in ${hospital.city}, ${hospital.state}. Contact the hospital directly for current appointment availability, services and visiting hours.`}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    {
                      label: "Rating",
                      value:
                        hospital.rating == null
                          ? "Not rated"
                          : `${Number(hospital.rating).toFixed(1)} / 5`,
                      icon: <Star size={16} />,
                    },
                    {
                      label: "Reviews",
                      value: String(hospital.review_count ?? 0),
                      icon: <CheckCircle2 size={16} />,
                    },
                    {
                      label: "Beds",
                      value:
                        hospital.bed_count == null
                          ? "Not listed"
                          : String(hospital.bed_count),
                      icon: <Bed size={16} />,
                    },
                    {
                      label: "Established",
                      value: hospital.established_year
                        ? String(hospital.established_year)
                        : "Not listed",
                      icon: <CalendarDays size={16} />,
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-[#f0f5f3] p-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        {item.icon}
                        {item.label}
                      </div>
                      <p className="mt-2 font-display text-lg font-bold text-slate-900">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>

            </>
          )}

          {activeTab === "departments" && (
            <Section title={`Departments (${departments.length})`}>
              {departments.length ? (
                <div className="flex flex-wrap gap-2">
                  {departments.map((department) => (
                    <span
                      key={department}
                      className="rounded-full bg-[#e9f5f1] px-3 py-2 text-sm font-medium text-[#176d5b]"
                    >
                      {department}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyMessage>
                  Department information has not been added yet.
                </EmptyMessage>
              )}
            </Section>

          )}

          {activeTab === "doctors" && (
            <Section
              title={`Doctors (${hasStructuredDoctors ? doctors.length : legacyDoctors.length})`}
            >
              {hasStructuredDoctors ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {doctors.map((doctor) => (
                    <article
                      key={doctor.id}
                      className="flex gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      {doctor.image_url ? (
                        <img
                          src={doctor.image_url}
                          alt={doctor.name}
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-[#e9f5f1] text-[#168f7e]">
                          <Stethoscope size={23} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-slate-900">
                          {doctor.name}
                        </h3>
                        <p className="mt-0.5 text-sm text-[#168f7e]">
                          {doctor.specialty || "Specialist"}
                        </p>
                        {doctor.qualification && (
                          <p className="mt-1 text-xs text-slate-500">
                            {doctor.qualification}
                          </p>
                        )}
                        {doctor.experience && (
                          <p className="mt-1 text-xs text-slate-500">
                            {doctor.experience} experience
                          </p>
                        )}
                        {doctor.consultation_fee != null && (
                          <p className="mt-1 text-xs font-semibold text-slate-700">
                            Consultation: ₹
                            {Number(doctor.consultation_fee).toLocaleString("en-IN")}
                          </p>
                        )}
                        <Link
                          to={`/hospitals/${hospital.id}/doctors/${doctor.id}`}
                          className="mt-3 inline-flex text-sm font-semibold text-[#087b69] hover:underline"
                        >
                          View doctor profile →
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : legacyDoctors.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {legacyDoctors.map((doctor, index) => (
                    <article
                      key={`${doctor.name || "doctor"}-${index}`}
                      className="flex gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      {doctor.image_url ? (
                        <img
                          src={doctor.image_url}
                          alt={doctor.name || "Doctor"}
                          className="h-14 w-14 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#e9f5f1] text-[#168f7e]">
                          <Stethoscope size={23} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900">
                          {doctor.name || "Doctor"}
                        </h3>
                        <p className="mt-0.5 text-sm text-[#168f7e]">
                          {doctor.specialty || "Specialist"}
                        </p>
                        {doctor.qualification && (
                          <p className="mt-1 text-xs text-slate-500">
                            {doctor.qualification}
                          </p>
                        )}
                        {doctor.experience && (
                          <p className="mt-1 text-xs text-slate-500">
                            {doctor.experience} experience
                          </p>
                        )}
                        {doctor.fee != null && (
                          <p className="mt-1 text-xs font-semibold text-slate-700">
                            Consultation: ₹{doctor.fee}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyMessage>
                  Doctor profiles have not been added yet. Please contact the
                  hospital for its current doctor roster.
                </EmptyMessage>
              )}
            </Section>

          )}

          {activeTab === "overview" && (
            <Section title="Hospital location">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <iframe
                  title={`Map showing ${hospital.name}`}
                  src={mapUrl}
                  className="h-72 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#168f7e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#117565]"
              >
                <MapPin size={16} />
                Get directions
              </a>
              <p className="mt-2 text-xs text-slate-500">
                Map location is based on the hospital coordinates when available,
                otherwise its saved address is used.
              </p>
            </Section>
          )}

          {activeTab === "lab-tests" && (
            <HospitalLabTests hospitalId={hospital.id} />
          )}
        </div>

        <aside className="space-y-5">
          <Section title="Contact">
            <div className="space-y-3 text-sm">
              {hospital.phone && (
                <a
                  href={`tel:${hospital.phone}`}
                  className="flex items-center gap-2 text-slate-700 hover:text-[#168f7e]"
                >
                  <Phone size={16} />
                  {hospital.phone}
                </a>
              )}
              {hospital.email && (
                <a
                  href={`mailto:${hospital.email}`}
                  className="flex items-center gap-2 break-all text-slate-700 hover:text-[#168f7e]"
                >
                  <Mail size={16} />
                  {hospital.email}
                </a>
              )}
              {hospital.website && (
                <a
                  href={
                    hospital.website.startsWith("http")
                      ? hospital.website
                      : `https://${hospital.website}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-[#168f7e] underline"
                >
                  Official website
                </a>
              )}
              <p className="flex items-start gap-2 text-slate-600">
                <MapPin size={16} className="mt-0.5 shrink-0" />
                {[hospital.address, hospital.city, hospital.state]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          </Section>

          <Section title={`Facilities (${facilities.length})`}>
            {facilities.length ? (
              <ul className="space-y-2 text-sm text-slate-600">
                {facilities.map((facility) => (
                  <li key={facility} className="flex gap-2">
                    <CheckCircle2
                      size={15}
                      className="mt-0.5 shrink-0 text-[#168f7e]"
                    />
                    {facility}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyMessage>No facility details listed.</EmptyMessage>
            )}
          </Section>

          <Section title={`Services (${services.length})`}>
            {services.length ? (
              <ul className="space-y-2 text-sm text-slate-600">
                {services.map((service) => (
                  <li key={service} className="flex gap-2">
                    <CheckCircle2
                      size={15}
                      className="mt-0.5 shrink-0 text-[#168f7e]"
                    />
                    {service}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyMessage>No service details listed.</EmptyMessage>
            )}
          </Section>

          {relatedInfo && (
            <div
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"
            >
              {relatedInfo}
            </div>
          )}
        </aside>
      </main>
      <Footer />
    </div>
  );
}
