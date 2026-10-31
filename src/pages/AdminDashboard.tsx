import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { requireSupabase } from "@/lib/supabase";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LogOut } from "lucide-react";

/* ================= types ================= */
type Status = "pending" | "under_review" | "approved" | "rejected" | "suspended";
type View = "overview" | "verification" | "orders" | "inventory" | "customers" | "blood-groups" | "medicines" | "explorer";

type Pharmacy = {
    id: string;
    name: string;
    state: string;
    district: string;
    city: string;
    phone: string | null;
    email: string | null;
    address: string;
    created_at: string;
    verification_note: string | null;
    verification_status: Status | null;
    is_active: boolean | null;
    owner_user_id: string | null;
};

type VerificationDocument = {
    id: string;
    pharmacy_id: string;
    document_type: string;
    storage_path: string;
    review_status: Status;
    reviewer_note: string | null;
    created_at: string;
};

type AdminOrder = {
    id: string;
    order_number: string | null;
    pharmacy_id: string;
    customer_user_id: string | null;
    customer_name: string;
    customer_phone: string;
    delivery_address: string | null;
    status: string;
    subtotal: number | string;
    quoted_subtotal: number | string | null;
    final_total: number | string | null;
    fulfillment_choice: string | null;
    created_at: string;
    completed_at: string | null;
    quote_sent_at: string | null;
    customer_accepted_quote_at: string | null;
};

type AdminInventoryRow = {
    pharmacy_id: string;
    pharmacy_name: string;
    state: string;
    district: string;
    city: string;
    verification_status: string;
    medicine_id: string;
    medicine_name: string;
    generic_name: string | null;
    quantity_on_hand: number;
    reorder_level: number;
    selling_price: number | string;
    is_low_stock: boolean;
    nearest_expiry: string | null;
};

type AdminCustomer = {
    customer_key: string;
    customer_name: string;
    customer_phone: string;
    orders: number;
    completed_orders: number;
    completed_sales: number | string;
    last_order_at: string;
};

type PatientProfile = {
    id: string;
    full_name: string | null;
    age: number | null;
    blood_group: string | null;
    city: string | null;
    district: string | null;
    phone: string | null;
};

type Medicine = {
    medicine_id: string;
    medicine_name: string;
    pharmacies_selling: number;
    units_sold: number;
    sales_revenue: number | string;
    gross_profit: number | string;
};

type PharmacyPerf = {
    pharmacy_id: string;
    pharmacy_name: string;
    state: string;
    district: string;
    city: string;
    verification_status: string | null;
    is_active: boolean | null;
    orders: number;
    units_sold: number;
    sales_revenue: number | string;
    gross_profit: number | string;
};

type SeriesRow = {
    day: string;
    orders: number;
    units_sold: number;
    sales_revenue: number | string;
    gross_profit: number | string;
};

type TopMed = {
    medicine_name: string;
    units_sold: number;
    sales_revenue: number | string;
    gross_profit: number | string;
};

type Group = {
    key: string;
    label: string;
    sub: string;
    status: string | null;
    pharmacies: number;
    orders: number;
    units: number;
    revenue: number;
    profit: number;
};

type DailySale = {
    day: string;
    orders: number;
    units_sold: number;
    sales_revenue: number | string;
    gross_profit: number | string;
};

/* ================= helpers ================= */
const inr = (v: unknown) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const num = (v: unknown) => Number(v || 0).toLocaleString("en-IN");
const initials = (name: string) =>
    (name || "?")
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("");
const statusOf = (p: Pharmacy): Status => (p.verification_status || "pending") as Status;

const STATUS_STYLE: Record<Status, string> = {
    pending: "bg-[#FDEFD9] text-[#9A3412]",
    under_review: "bg-[#E8EEFB] text-[#3558C8]",
    approved: "bg-[#E3F6F0] text-[#0A7A5A]",
    rejected: "bg-[#FDE7EC] text-[#9F1239]",
    suspended: "bg-[#EEE9F8] text-[#5B3AA8]",
};

const VIEWS: View[] = ["overview", "verification", "orders", "inventory", "customers", "blood-groups", "medicines", "explorer"];
const FILTERS: Array<"all" | Status> = ["all", "pending", "under_review", "approved", "rejected", "suspended"];
const REQUIRED_VERIFICATION_DOCUMENTS = ["aadhaar", "pharmacy_license", "owner_photo", "shop_photo"] as const;

const readHash = (): View => {
    if (typeof window === "undefined") return "overview";
    const h = window.location.hash.replace("#", "") as View;
    return VIEWS.includes(h) ? h : "overview";
};

function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d={d} />
        </svg>
    );
}

const ICONS = {
    dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
    pill: "M10.5 20.5a5 5 0 01-7-7l10-10a5 5 0 017 7zM8.5 8.5l7 7",
    pin: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
    rupee: "M6 4h12M6 9h12M9 4c6 0 6 9 0 9H6l8 7",
    cart: "M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z",
    store: "M3 9l2-5h14l2 5M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M5 12v8h14v-8M10 20v-4h4v4",
    warehouse: "M3 10l9-7 9 7v10h-6v-6H9v6H3zM7 10h.01M12 10h.01M17 10h.01",
    users: "M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8zM20 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    search: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z",
    check: "M5 13l4 4L19 7",
    arrow: "M5 12h14M13 6l6 6-6 6",
    alert: "M12 3l10 18H2zM12 10v5M12 18v.01",
    chart: "M3 3v18h18M7 15l4-5 3 3 5-7",
    download: "M12 4v12M7 11l5 5 5-5M4 20h16",
};

const VIEW_META: Record<View, { title: string; subtitle: string }> = {
    overview: { title: "Overview", subtitle: "A quick look at sales, approvals and what needs your attention." },
    verification: { title: "Pharmacy verification", subtitle: "Review new pharmacies and manage who can sell on CareNexa." },
    orders: { title: "Orders", subtitle: "Monitor customer orders across pharmacies without changing stock-sensitive order states." },
    inventory: { title: "Pharmacy inventory", subtitle: "Review stock levels and expiry alerts across all pharmacy partners." },
    customers: { title: "Customers", subtitle: "Review platform-wide order activity and customer trends." },
    "blood-groups": { title: "Blood groups", subtitle: "Find customer blood group information by name, blood group or city." },
    medicines: { title: "Medicine performance", subtitle: "Demand, stock coverage and profit for every medicine." },
    explorer: { title: "Revenue explorer", subtitle: "Drill from state to district, city and pharmacy to see exactly where revenue comes from." },
};

/* small shared UI pieces */
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <section className={`rounded-2xl border border-[#E3ECE9] bg-white p-5 shadow-[0_1px_2px_rgba(15,42,46,0.04)] md:p-6 ${className}`}>
        {children}
    </section>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
    <p className="rounded-xl bg-[#F0F5F3] p-6 text-center text-sm text-[#5B7479]">{children}</p>
);

const titleCase = (s: string) => (s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const displayStatus = (s: string) => s.replace(/_/g, " ");
const maskedPhone = (value: string) => `••••••${value.replace(/\D/g, "").slice(-4)}`;
function errorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "object" && error !== null) {
        const details = error as Record<string, unknown>;
        const message = typeof details.message === "string" ? details.message : "";
        const detail = typeof details.details === "string" ? details.details : "";
        if (message || detail) return [message, detail].filter(Boolean).join(": ");
    }
    return fallback;
}
const stockCondition = (row: AdminInventoryRow) => {
    if (Number(row.quantity_on_hand) <= 0) return "out of stock";
    if (row.nearest_expiry) {
        const daysLeft = Math.ceil((new Date(row.nearest_expiry).getTime() - Date.now()) / 86_400_000);
        if (daysLeft < 0) return "expired";
        if (daysLeft <= 60) return "expiring";
    }
    if (row.is_low_stock || Number(row.quantity_on_hand) <= Number(row.reorder_level)) return "low stock";
    return "in stock";
};

function Select({
    label,
    value,
    onChange,
    options,
    placeholder,
    disabled,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder: string;
    disabled?: boolean;
}) {
    return (
        <label className="flex min-w-[160px] flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5B7479]">
            {label}
            <select
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className="min-h-[44px] rounded-[10px] border border-[#DDE7E4] bg-white px-3 text-[13px] font-semibold normal-case tracking-normal text-[#0F2A2E] disabled:bg-[#F0F5F3] disabled:text-[#9BB0AC]"
            >
                <option value="">{placeholder}</option>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* ================= component ================= */
export default function AdminDashboard() {
    const navigate = useNavigate();
    const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
    const [orders, setOrders] = useState<AdminOrder[]>([]);
    const [inventoryRows, setInventoryRows] = useState<AdminInventoryRow[]>([]);
    const [customerRows, setCustomerRows] = useState<AdminCustomer[]>([]);
    const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>([]);
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [perf, setPerf] = useState<PharmacyPerf[]>([]);
    const [ready, setReady] = useState(false);
    const [daily, setDaily] = useState<DailySale[]>([]);
    const [verificationDocuments, setVerificationDocuments] = useState<VerificationDocument[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [signingOut, setSigningOut] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [expandedPharmacyId, setExpandedPharmacyId] = useState<string | null>(null);
    const [signedDocumentUrls, setSignedDocumentUrls] = useState<Record<string, string>>({});
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

    const [view, setViewState] = useState<View>(readHash);
    const [range, setRange] = useState<7 | 30>(7);
    const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
    const [orderStatusFilter, setOrderStatusFilter] = useState("all");
    const [orderQuery, setOrderQuery] = useState("");
    const [inventoryQuery, setInventoryQuery] = useState("");
    const [customerQuery, setCustomerQuery] = useState("");
    const [patientNameQuery, setPatientNameQuery] = useState("");
    const [patientCityQuery, setPatientCityQuery] = useState("");
    const [patientBloodGroupFilter, setPatientBloodGroupFilter] = useState("");
    const [medQuery, setMedQuery] = useState("");
    const [medFilter, setMedFilter] = useState<"all" | "selling" | "nosales" | "notstocked">("all");
    const [showAllMeds, setShowAllMeds] = useState(false);

    // revenue explorer
    const [fState, setFState] = useState("");
    const [fDistrict, setFDistrict] = useState("");
    const [fCity, setFCity] = useState("");
    const [fPharmacy, setFPharmacy] = useState("");
    const [exRange, setExRange] = useState<7 | 30>(30);
    const [series, setSeries] = useState<SeriesRow[]>([]);
    const [selMeds, setSelMeds] = useState<TopMed[]>([]);
    const [exLoading, setExLoading] = useState(false);

    const pickState = (v: string) => { setFState(v); setFDistrict(""); setFCity(""); setFPharmacy(""); };
    const pickDistrict = (v: string) => { setFDistrict(v); setFCity(""); setFPharmacy(""); };
    const pickCity = (v: string) => { setFCity(v); setFPharmacy(""); };

    function go(v: View) {
        setViewState(v);
        window.history.replaceState(null, "", `#${v}`);
        window.scrollTo({ top: 0 });
    }

    useEffect(() => {
        const onHash = () => setViewState(readHash());
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
    }, []);

    async function load() {
        try {
            setError("");
            const db = requireSupabase();
            const { data: { user }, error: userError } = await db.auth.getUser();
            if (userError) throw userError;
            if (!user) {
                setError("Admin sign-in required.");
                return;
            }
            const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
            if (profileError) throw profileError;
            if (profile?.role !== "admin") {
                setError("Access denied. This account is not assigned the admin role.");
                return;
            }
            const [p, m, l, d, docs, orderResult, inventoryResult, customerResult, patientResult] = await Promise.all([
                db
                    .from("pharmacies")
                    .select("id,name,state,district,city,phone,email,address,created_at,verification_note,verification_status,is_active,owner_user_id")
                    .order("created_at", { ascending: false }),
                db.from("admin_medicine_performance").select("*").order("units_sold", { ascending: false }).limit(100),
                db.from("admin_pharmacy_performance").select("*").order("sales_revenue", { ascending: false }),
                db.from("admin_daily_sales").select("*").order("day", { ascending: false }).limit(30),
                db.from("pharmacy_verification_documents")
                    .select("id,pharmacy_id,document_type,storage_path,review_status,reviewer_note,created_at")
                    .order("created_at", { ascending: false }),
                db.from("orders")
                    .select("id,order_number,pharmacy_id,customer_user_id,customer_name,customer_phone,delivery_address,status,subtotal,quoted_subtotal,final_total,fulfillment_choice,created_at,completed_at,quote_sent_at,customer_accepted_quote_at")
                    .order("created_at", { ascending: false })
                    .limit(100),
                db.from("admin_inventory_status").select("*").order("quantity_on_hand", { ascending: true }).limit(1000),
                db.from("admin_customer_summary").select("*").order("completed_sales", { ascending: false }).limit(1000),
                db.from("profiles")
                    .select("id,full_name,age,blood_group,city,district,phone")
                    .eq("role", "customer")
                    .order("full_name", { ascending: true })
                    .limit(1000),
            ]);
            if (p.error) throw p.error;
            if (m.error) throw m.error;
            if (l.error) throw l.error;
            if (d.error) throw d.error;
            if (docs.error) throw docs.error;
            if (orderResult.error) throw orderResult.error;
            if (inventoryResult.error) throw inventoryResult.error;
            if (customerResult.error) throw customerResult.error;
            if (patientResult.error) throw patientResult.error;
            setPharmacies(p.data || []);
            setOrders((orderResult.data || []) as AdminOrder[]);
            setInventoryRows((inventoryResult.data || []) as AdminInventoryRow[]);
            setCustomerRows((customerResult.data || []) as AdminCustomer[]);
            setPatientProfiles((patientResult.data || []) as PatientProfile[]);
            setMedicines(m.data || []);
            setPerf(l.data || []);
            setReady(true);
            setDaily(d.data || []);
            setVerificationDocuments((docs.data || []) as VerificationDocument[]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load admin analytics");
        } finally {
            setLoading(false);
        }
    }

    async function signOut() {
        setSigningOut(true);
        setError("");
        try {
            const { error: signOutError } = await requireSupabase().auth.signOut({ scope: "local" });
            if (signOutError) throw signOutError;
            navigate("/account", { replace: true });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not sign out. Please try again.");
            setSigningOut(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function review(id: string, status: Status) {
        try {
            setBusyId(id);
            const db = requireSupabase();
            const { error } = await db.rpc("admin_review_pharmacy", {
                p_pharmacy_id: id,
                p_status: status,
                p_note: reviewNotes[id] || null,
            });
            if (error) throw error;
            await load();
        } catch (e) {
            setError(errorMessage(e, "Review update failed"));
        } finally {
            setBusyId(null);
        }
    }

    async function reviewDocument(documentId: string, status: "approved" | "rejected", pharmacyId: string) {
        try {
            setBusyId(`document:${documentId}`);
            const { error } = await requireSupabase().rpc("admin_review_pharmacy_document", {
                p_document_id: documentId,
                p_status: status,
                p_note: reviewNotes[pharmacyId] || null,
            });
            if (error) throw error;
            await load();
        } catch (e) {
            setError(errorMessage(e, "Document review failed"));
        } finally {
            setBusyId(null);
        }
    }

    async function createDocumentPreview(documentId: string, storagePath: string) {
        try {
            setBusyId(`preview:${documentId}`);
            const { data, error } = await requireSupabase()
                .storage.from("carenexa-verification")
                .createSignedUrl(storagePath, 600);
            if (error) throw error;
            setSignedDocumentUrls((current) => ({ ...current, [documentId]: data.signedUrl }));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not create a private document preview");
        } finally {
            setBusyId(null);
        }
    }

    /* ---------- derived data ---------- */
    const stats = useMemo(() => {
        const revenue = medicines.reduce((s, m) => s + Number(m.sales_revenue || 0), 0);
        const profit = medicines.reduce((s, m) => s + Number(m.gross_profit || 0), 0);
        const units = medicines.reduce((s, m) => s + Number(m.units_sold || 0), 0);
        const pending = pharmacies.filter((p) => ["pending", "under_review"].includes(statusOf(p))).length;
        const active = pharmacies.filter((p) => p.is_active).length;
        const notStocked = medicines.filter((m) => Number(m.pharmacies_selling) === 0).length;
        return { revenue, profit, units, pending, active, notStocked };
    }, [medicines, pharmacies]);

    const countByStatus = useMemo(() => {
        const c: Record<string, number> = { all: pharmacies.length, pending: 0, under_review: 0, approved: 0, rejected: 0, suspended: 0 };
        pharmacies.forEach((p) => (c[statusOf(p)] += 1));
        return c;
    }, [pharmacies]);

    const filteredPharmacies = useMemo(
        () => pharmacies.filter((p) => statusFilter === "all" || statusOf(p) === statusFilter),
        [pharmacies, statusFilter]
    );
    const pharmaciesById = useMemo(() => new Map(pharmacies.map((pharmacy) => [pharmacy.id, pharmacy])), [pharmacies]);
    const filteredOrders = useMemo(() => {
        const q = orderQuery.trim().toLowerCase();
        return orders.filter((order) => {
            if (orderStatusFilter !== "all" && order.status !== orderStatusFilter) return false;
            if (!q) return true;
            const pharmacyName = pharmaciesById.get(order.pharmacy_id)?.name || "";
            return [order.order_number, order.customer_name, order.customer_phone, pharmacyName, order.id]
                .some((value) => value?.toLowerCase().includes(q));
        });
    }, [orders, orderQuery, orderStatusFilter, pharmaciesById]);
    const filteredInventory = useMemo(() => {
        const q = inventoryQuery.trim().toLowerCase();
        return inventoryRows.filter((row) =>
            !q || [row.pharmacy_name, row.medicine_name, row.generic_name, row.city, row.district, row.state]
                .some((value) => value?.toLowerCase().includes(q))
        );
    }, [inventoryRows, inventoryQuery]);
    const filteredCustomers = useMemo(() => {
        const q = customerQuery.trim().toLowerCase();
        return customerRows.filter((customer) =>
            !q || [customer.customer_name, maskedPhone(customer.customer_phone)]
                .some((value) => value?.toLowerCase().includes(q))
        );
    }, [customerRows, customerQuery]);
    const filteredPatientProfiles = useMemo(() => {
        const nameQuery = patientNameQuery.trim().toLowerCase();
        const cityQuery = patientCityQuery.trim().toLowerCase();
        return patientProfiles.filter((patient) =>
            (!nameQuery || patient.full_name?.toLowerCase().includes(nameQuery)) &&
            (!cityQuery || patient.city?.toLowerCase().includes(cityQuery)) &&
            (!patientBloodGroupFilter || patient.blood_group === patientBloodGroupFilter)
        );
    }, [patientProfiles, patientNameQuery, patientCityQuery, patientBloodGroupFilter]);

    const pendingPharmacies = useMemo(
        () => pharmacies.filter((p) => ["pending", "under_review"].includes(statusOf(p))),
        [pharmacies]
    );

    const filteredMedicines = useMemo(() => {
        const q = medQuery.trim().toLowerCase();
        return medicines.filter((m) => {
            if (q && !m.medicine_name?.toLowerCase().includes(q)) return false;
            const stocked = Number(m.pharmacies_selling) > 0;
            const sold = Number(m.units_sold) > 0;
            if (medFilter === "selling") return stocked && sold;
            if (medFilter === "nosales") return stocked && !sold;
            if (medFilter === "notstocked") return !stocked;
            return true;
        });
    }, [medicines, medQuery, medFilter]);

    const visibleMedicines = showAllMeds ? filteredMedicines : filteredMedicines.slice(0, 12);

    const topMeds = useMemo(
        () =>
            [...medicines]
                .sort((a, b) => Number(b.sales_revenue || 0) - Number(a.sales_revenue || 0))
                .slice(0, 5)
                .filter((m) => Number(m.sales_revenue || 0) > 0),
        [medicines]
    );
    const maxMedRevenue = Math.max(1, ...topMeds.map((m) => Number(m.sales_revenue || 0)));

    // top cities for the Overview card, built from per-pharmacy numbers
    const topLocations = useMemo(() => {
        const m = new Map<string, { state: string; district: string; city: string; pharmacy_count: number; sales_revenue: number }>();
        perf.forEach((p) => {
            const k = `${p.state}|${p.district}|${p.city}`;
            const cur = m.get(k) || { state: p.state, district: p.district, city: p.city, pharmacy_count: 0, sales_revenue: 0 };
            cur.pharmacy_count += 1;
            cur.sales_revenue += Number(p.sales_revenue || 0);
            m.set(k, cur);
        });
        return [...m.values()].sort((a, b) => b.sales_revenue - a.sales_revenue).slice(0, 5);
    }, [perf]);
    const maxLocRevenue = Math.max(1, ...topLocations.map((l) => l.sales_revenue));

    /* ----- revenue explorer: filters, totals, breakdown ----- */
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
    const stateOptions = useMemo(() => uniq(perf.map((p) => p.state)), [perf]);
    const districtOptions = useMemo(
        () => (fState ? uniq(perf.filter((p) => p.state === fState).map((p) => p.district)) : []),
        [perf, fState]
    );
    const cityOptions = useMemo(
        () => (fDistrict ? uniq(perf.filter((p) => p.state === fState && p.district === fDistrict).map((p) => p.city)) : []),
        [perf, fState, fDistrict]
    );
    const pharmacyOptions = useMemo(
        () =>
            fCity
                ? perf
                    .filter((p) => p.state === fState && p.district === fDistrict && p.city === fCity)
                    .sort((a, b) => a.pharmacy_name.localeCompare(b.pharmacy_name))
                : [],
        [perf, fState, fDistrict, fCity]
    );

    const selRows = useMemo(
        () =>
            perf.filter(
                (p) =>
                    (!fState || p.state === fState) &&
                    (!fDistrict || p.district === fDistrict) &&
                    (!fCity || p.city === fCity) &&
                    (!fPharmacy || p.pharmacy_id === fPharmacy)
            ),
        [perf, fState, fDistrict, fCity, fPharmacy]
    );

    const selTotals = useMemo(() => {
        const revenue = selRows.reduce((s, p) => s + Number(p.sales_revenue || 0), 0);
        const profit = selRows.reduce((s, p) => s + Number(p.gross_profit || 0), 0);
        const orders = selRows.reduce((s, p) => s + Number(p.orders || 0), 0);
        const units = selRows.reduce((s, p) => s + Number(p.units_sold || 0), 0);
        return { revenue, profit, orders, units, margin: revenue > 0 ? (profit / revenue) * 100 : 0, aov: orders > 0 ? revenue / orders : 0 };
    }, [selRows]);

    // what the table groups by depends on how deep the admin has drilled
    const level: "state" | "district" | "city" | "pharmacy" = fCity ? "pharmacy" : fDistrict ? "city" : fState ? "district" : "state";

    const groups = useMemo(() => {
        const m = new Map<string, Group>();
        selRows.forEach((p) => {
            const key = level === "state" ? p.state : level === "district" ? p.district : level === "city" ? p.city : p.pharmacy_id;
            const g =
                m.get(key) ||
                ({
                    key,
                    label: level === "pharmacy" ? p.pharmacy_name : key,
                    sub: level === "pharmacy" ? `${p.city}, ${p.district}` : "",
                    status: level === "pharmacy" ? p.verification_status : null,
                    pharmacies: 0,
                    orders: 0,
                    units: 0,
                    revenue: 0,
                    profit: 0,
                } as Group);
            g.pharmacies += 1;
            g.orders += Number(p.orders || 0);
            g.units += Number(p.units_sold || 0);
            g.revenue += Number(p.sales_revenue || 0);
            g.profit += Number(p.gross_profit || 0);
            m.set(key, g);
        });
        return [...m.values()].sort((a, b) => b.revenue - a.revenue);
    }, [selRows, level]);

    function drill(key: string) {
        if (level === "state") pickState(key);
        else if (level === "district") pickDistrict(key);
        else if (level === "city") pickCity(key);
        else setFPharmacy(key);
    }

    // revenue series + top medicines for whatever is selected (aggregated in the database)
    useEffect(() => {
        if (!ready || view !== "explorer") return;
        let cancelled = false;
        (async () => {
            try {
                setExLoading(true);
                const db = requireSupabase();
                const args = { p_state: fState || null, p_district: fDistrict || null, p_city: fCity || null, p_pharmacy: fPharmacy || null };
                const [s, t] = await Promise.all([
                    db.rpc("admin_revenue_series", { ...args, p_days: exRange * 2 }),
                    db.rpc("admin_top_medicines", { ...args, p_limit: 6 }),
                ]);
                if (s.error) throw s.error;
                if (t.error) throw t.error;
                if (!cancelled) {
                    setSeries((s.data as SeriesRow[]) || []);
                    setSelMeds((t.data as TopMed[]) || []);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Could not load revenue details");
            } finally {
                if (!cancelled) setExLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [ready, view, fState, fDistrict, fCity, fPharmacy, exRange]);

    const chartData = useMemo(
        () =>
            daily
                .slice(0, range)
                .reverse()
                .map((d) => ({
                    day: new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
                    revenue: Number(d.sales_revenue || 0),
                    profit: Number(d.gross_profit || 0),
                })),
        [daily, range]
    );

    const kpis = [
        { label: "Total revenue", value: inr(stats.revenue), sub: `Profit ${inr(stats.profit)}`, icon: ICONS.rupee, tone: "bg-[#E3F6F0] text-[#0E7C6B]", bar: "bg-[#0E7C6B]" },
        { label: "Units sold", value: num(stats.units), sub: `${medicines.length} medicines tracked`, icon: ICONS.cart, tone: "bg-[#E8EEFB] text-[#3558C8]", bar: "bg-[#3558C8]" },
        { label: "Active pharmacies", value: `${stats.active}`, sub: `of ${pharmacies.length} registered`, icon: ICONS.store, tone: "bg-[#F1ECFB] text-[#6D47C2]", bar: "bg-[#6D47C2]" },
        { label: "Pending reviews", value: `${stats.pending}`, sub: stats.pending ? "Need your attention" : "All caught up", icon: ICONS.clock, tone: "bg-[#FDEFD9] text-[#B45309]", bar: "bg-[#E8913A]" },
    ];

    const nav: Array<{ id: View; label: string; icon: string; badge?: number }> = [
        { id: "overview", label: "Overview", icon: ICONS.dashboard },
        { id: "verification", label: "Verification", icon: ICONS.shield, badge: stats.pending },
        { id: "orders", label: "Orders", icon: ICONS.cart },
        { id: "inventory", label: "Inventory", icon: ICONS.warehouse },
        { id: "customers", label: "Customers", icon: ICONS.users },
        { id: "blood-groups", label: "Blood groups", icon: ICONS.users },
        { id: "medicines", label: "Medicines", icon: ICONS.pill },
        { id: "explorer", label: "Revenue explorer", icon: ICONS.pin },
    ];

    /* ================= views ================= */

    const overview = (
        <>
            {/* KPI cards */}
            <section aria-label="Key numbers" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {kpis.map((k) => (
                    <div key={k.label} className="relative overflow-hidden rounded-2xl border border-[#E3ECE9] bg-white p-5 shadow-[0_1px_2px_rgba(15,42,46,0.04)]">
                        <span className={`absolute inset-x-0 top-0 h-1 ${k.bar}`} />
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-[#5B7479]">{k.label}</span>
                            <span className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${k.tone}`}>
                                <Icon d={k.icon} className="h-[18px] w-[18px]" />
                            </span>
                        </div>
                        <p className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight">
                            {loading ? <span className="inline-block h-8 w-28 animate-pulse rounded bg-[#E3ECE9]" /> : k.value}
                        </p>
                        <p className="mt-1 text-xs font-medium text-[#5B7479]">{k.sub}</p>
                    </div>
                ))}
            </section>

            <section aria-label="Partner operations" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {([
                    ["orders", "Orders", `${orders.length} recent`, ICONS.cart],
                    ["inventory", "Partner inventory", `${inventoryRows.length} stock entries`, ICONS.warehouse],
                    ["customers", "Customers", `${customerRows.length} customer records`, ICONS.users],
                    ["verification", "Verification", `${stats.pending} waiting for review`, ICONS.shield],
                ] as const).map(([target, label, detail, icon]) => (
                    <button key={target} onClick={() => go(target)} className="flex min-h-[84px] items-center gap-3 rounded-xl border border-[#E3ECE9] bg-white p-4 text-left hover:border-[#0E7C6B]">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E3F6F0] text-[#0E7C6B]"><Icon d={icon} /></span>
                        <span><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs text-[#5B7479]">{detail}</span></span>
                    </button>
                ))}
            </section>

            {/* revenue chart */}
            <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold">Revenue &amp; profit</h2>
                        <p className="mt-0.5 text-xs text-[#5B7479]">Completed orders, last {range} days</p>
                    </div>
                    <div className="flex gap-1 rounded-[10px] bg-[#F0F5F3] p-1">
                        {([7, 30] as const).map((r) => (
                            <button
                                key={r}
                                onClick={() => setRange(r)}
                                aria-pressed={range === r}
                                className={`min-h-[36px] rounded-[7px] px-3.5 text-xs font-semibold transition-colors ${range === r ? "bg-white text-[#0F2A2E] shadow-sm" : "text-[#5B7479] hover:text-[#0F2A2E]"
                                    }`}
                            >
                                {r}D
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-3 flex gap-5 text-xs font-semibold text-[#3E5A5F]">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#0E7C6B]" />Revenue</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#E8913A]" />Gross profit</span>
                </div>
                {!loading && chartData.length === 0 ? (
                    <div className="mt-4"><Empty>No completed orders yet. Your daily revenue will appear here.</Empty></div>
                ) : (
                    <div className="mt-3 h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke="#E3ECE9" vertical={false} />
                                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#5B7479" />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    fontSize={11}
                                    stroke="#5B7479"
                                    width={52}
                                    tickFormatter={(v) => (Number(v) >= 1000 ? `₹${Number(v) / 1000}K` : `₹${v}`)}
                                />
                                <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 10, border: "1px solid #DDE7E4", fontSize: 12 }} />
                                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0E7C6B" fill="#0E7C6B" fillOpacity={0.12} strokeWidth={3} />
                                <Area type="monotone" dataKey="profit" name="Gross profit" stroke="#E8913A" fill="#E8913A" fillOpacity={0.1} strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </Card>

            {/* summary cards: each one links to its own page */}
            <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold">Needs attention</h2>
                        <button onClick={() => go("verification")} className="min-h-[36px] text-[13px] font-bold text-[#0E7C6B]">
                            All pharmacies →
                        </button>
                    </div>
                    <div className="mt-3 space-y-3">
                        {pendingPharmacies.length === 0 && (
                            <div className="flex items-center gap-3 rounded-xl bg-[#E3F6F0] p-4 text-sm font-semibold text-[#0A7A5A]">
                                <Icon d={ICONS.check} /> No pharmacies are waiting for review.
                            </div>
                        )}
                        {pendingPharmacies.slice(0, 3).map((p) => (
                            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#E3ECE9] p-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDEFD9] text-sm font-extrabold text-[#B45309]">
                                    {initials(p.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">{p.name}</p>
                                    <p className="truncate text-xs capitalize text-[#5B7479]">{p.city}, {p.state}</p>
                                </div>
                                <button onClick={() => go("verification")} className="min-h-[40px] rounded-[10px] bg-[#0E7C6B] px-3 text-xs font-bold text-white">
                                    Review
                                </button>
                            </div>
                        ))}
                        {stats.notStocked > 0 && (
                            <button
                                onClick={() => go("medicines")}
                                className="flex w-full items-center gap-3 rounded-xl bg-[#FDEFD9] p-3 text-left text-sm font-semibold text-[#9A3412]"
                            >
                                <Icon d={ICONS.alert} className="h-5 w-5 shrink-0" />
                                <span className="flex-1">{stats.notStocked} medicines aren’t stocked by any pharmacy</span>
                                <Icon d={ICONS.arrow} className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold">Top medicines</h2>
                        <button onClick={() => go("medicines")} className="min-h-[36px] text-[13px] font-bold text-[#0E7C6B]">
                            View all →
                        </button>
                    </div>
                    <div className="mt-4 space-y-4">
                        {topMeds.length === 0 && <Empty>No sales yet. Best sellers will show up here.</Empty>}
                        {topMeds.map((m, i) => (
                            <div key={m.medicine_id}>
                                <div className="flex justify-between gap-3 text-[13px]">
                                    <span className="truncate font-semibold">{m.medicine_name}</span>
                                    <b>{inr(m.sales_revenue)}</b>
                                </div>
                                <div className="mt-1.5 h-2.5 rounded-full bg-[#EDF3F1]">
                                    <div className="h-2.5 rounded-full bg-[#0E7C6B]" style={{ width: `${(Number(m.sales_revenue) / maxMedRevenue) * 100}%`, opacity: 1 - i * 0.12 }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold">Top locations</h2>
                        <button onClick={() => go("explorer")} className="min-h-[36px] text-[13px] font-bold text-[#0E7C6B]">
                            View all →
                        </button>
                    </div>
                    <div className="mt-4 space-y-4">
                        {topLocations.length === 0 && <Empty>No location data yet.</Empty>}
                        {topLocations.map((l, i) => (
                            <div key={`${l.state}-${l.district}-${l.city}-${i}`}>
                                <div className="flex justify-between gap-3 text-[13px]">
                                    <span className="truncate font-semibold capitalize">{l.city}, {l.state}</span>
                                    <b>{inr(l.sales_revenue)}</b>
                                </div>
                                <div className="mt-1.5 h-2.5 rounded-full bg-[#EDF3F1]">
                                    <div className="h-2.5 rounded-full bg-[#3558C8]" style={{ width: `${(Number(l.sales_revenue || 0) / maxLocRevenue) * 100}%`, opacity: 1 - i * 0.12 }} />
                                </div>
                                <p className="mt-1 text-[11px] text-[#5B7479]">{l.pharmacy_count} pharmac{Number(l.pharmacy_count) === 1 ? "y" : "ies"}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </>
    );

    const verification = (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold">All pharmacies</h2>
                <div className="flex flex-wrap gap-1 rounded-[10px] bg-[#F0F5F3] p-1" role="tablist" aria-label="Filter by status">
                    {FILTERS.map((f) => (
                        <button
                            key={f}
                            role="tab"
                            aria-selected={statusFilter === f}
                            onClick={() => setStatusFilter(f)}
                            className={`min-h-[36px] rounded-[7px] px-3 text-xs font-semibold capitalize transition-colors ${statusFilter === f ? "bg-white text-[#0F2A2E] shadow-sm" : "text-[#5B7479] hover:text-[#0F2A2E]"
                                }`}
                        >
                            {f} <span className="ml-1 text-[#5B7479]">{countByStatus[f]}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-4 space-y-3">
                {!loading && filteredPharmacies.length === 0 && (
                    <Empty>No pharmacies {statusFilter === "all" ? "registered yet" : `with status “${statusFilter}”`}.</Empty>
                )}
                {filteredPharmacies.map((p) => {
                    const status = statusOf(p);
                    const busy = busyId === p.id;
                    const documents = verificationDocuments.filter((document) => document.pharmacy_id === p.id);
                    const missingRequiredDocuments = REQUIRED_VERIFICATION_DOCUMENTS.filter((type) =>
                        documents.find((document) => document.document_type === type)?.review_status !== "approved"
                    );
                    const isExpanded = expandedPharmacyId === p.id;
                    return (
                        <article key={p.id} className="rounded-xl border border-[#E3ECE9] p-4 transition-colors hover:bg-[#F8FBFA]">
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E3F6F0] font-extrabold text-[#0E7C6B]">
                                    {initials(p.name)}
                                </div>
                                <div className="min-w-[200px] flex-1">
                                    <strong className="text-sm">{p.name}</strong>
                                    <p className="mt-0.5 text-xs capitalize text-[#5B7479]">
                                        {p.city}, {p.district}, {p.state} · {p.phone || "No phone"}
                                    </p>
                                    <p className="mt-1 text-xs text-[#5B7479]">{p.email || "No email"} · {p.address}</p>
                                </div>
                                <span className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold capitalize ${STATUS_STYLE[status]}`}>{displayStatus(status)}</span>
                                <div className="flex flex-wrap gap-2">
                                    <button disabled={busy || missingRequiredDocuments.length > 0} onClick={() => review(p.id, "approved")} className="min-h-[44px] rounded-[10px] bg-[#0E7C6B] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#0B6657] disabled:opacity-50">
                                        Approve
                                    </button>
                                    {status !== "under_review" && (
                                        <button disabled={busy} onClick={() => review(p.id, "under_review")} className="min-h-[44px] rounded-[10px] border border-[#DDE7E4] bg-white px-4 text-[13px] font-bold text-[#3E5A5F] hover:bg-[#F0F5F3] disabled:opacity-50">
                                            Start review
                                        </button>
                                    )}
                                    <button disabled={busy} onClick={() => review(p.id, "rejected")} className="min-h-[44px] rounded-[10px] border border-[#DDE7E4] bg-white px-4 text-[13px] font-bold text-[#3E5A5F] hover:bg-[#F0F5F3] disabled:opacity-50">
                                        Reject
                                    </button>
                                    <button disabled={busy} onClick={() => review(p.id, "suspended")} className="min-h-[44px] rounded-[10px] border border-[#DDE7E4] bg-white px-4 text-[13px] font-bold text-[#3E5A5F] hover:bg-[#F0F5F3] disabled:opacity-50">
                                        Suspend
                                    </button>
                                </div>
                            </div>
                            {missingRequiredDocuments.length > 0 && (
                                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                    Pharmacy approval requires the latest version of every document to be approved. Still needed: {missingRequiredDocuments.map(displayStatus).join(", ")}. Expand “Review documents” to review them.
                                </p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => setExpandedPharmacyId(isExpanded ? null : p.id)}
                                    className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#0E7C6B]"
                                >
                                    {isExpanded ? "Hide documents" : `Review documents (${documents.length})`}
                                </button>
                                <button
                                    onClick={() => {
                                        setFState(p.state);
                                        setFDistrict(p.district);
                                        setFCity(p.city);
                                        setFPharmacy(p.id);
                                        go("explorer");
                                    }}
                                    className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#3E5A5F]"
                                >
                                    View performance
                                </button>
                                <button
                                    onClick={() => {
                                        setInventoryQuery(p.name);
                                        go("inventory");
                                    }}
                                    className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#3E5A5F]"
                                >
                                    View stock
                                </button>
                                <label className="min-w-[220px] flex-1 text-xs font-semibold text-[#5B7479]">
                                    Review note
                                    <input
                                        value={reviewNotes[p.id] || ""}
                                        onChange={(event) => setReviewNotes((current) => ({ ...current, [p.id]: event.target.value }))}
                                        placeholder="Optional note for the pharmacy"
                                        className="mt-1 min-h-[38px] w-full rounded-lg border border-[#DDE7E4] bg-white px-3 text-sm font-normal text-[#0F2A2E]"
                                    />
                                </label>
                            </div>
                            {isExpanded && (
                                <div className="mt-4 space-y-3 border-t border-[#E3ECE9] pt-4">
                                    {documents.length === 0 && <Empty>No documents have been submitted yet.</Empty>}
                                    {documents.map((document) => (
                                        <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#F8FBFA] p-3">
                                            <div>
                                                <p className="text-sm font-semibold capitalize">{displayStatus(document.document_type)}</p>
                                                <p className="mt-1 text-xs capitalize text-[#5B7479]">
                                                    {displayStatus(document.review_status)}
                                                    {document.reviewer_note ? ` · ${document.reviewer_note}` : ""}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {signedDocumentUrls[document.id] ? (
                                                    <a
                                                        href={signedDocumentUrls[document.id]}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 py-2 text-xs font-bold text-[#0E7C6B]"
                                                    >
                                                        Open private preview
                                                    </a>
                                                ) : (
                                                    <button
                                                        disabled={busyId === `preview:${document.id}`}
                                                        onClick={() => void createDocumentPreview(document.id, document.storage_path)}
                                                        className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#0E7C6B] disabled:opacity-50"
                                                    >
                                                        {busyId === `preview:${document.id}` ? "Preparing…" : "Create preview"}
                                                    </button>
                                                )}
                                                <button
                                                    disabled={busyId === `document:${document.id}`}
                                                    onClick={() => void reviewDocument(document.id, "approved", p.id)}
                                                    className="min-h-[38px] rounded-lg bg-[#0E7C6B] px-3 text-xs font-bold text-white disabled:opacity-50"
                                                >
                                                    Approve document
                                                </button>
                                                <button
                                                    disabled={busyId === `document:${document.id}`}
                                                    onClick={() => void reviewDocument(document.id, "rejected", p.id)}
                                                    className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#3E5A5F] disabled:opacity-50"
                                                >
                                                    Reject document
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
        </Card>
    );

    const ordersView = (
        <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-base font-bold">Recent orders</h2>
                    <p className="mt-1 text-xs text-[#5B7479]">Latest 100 orders across all pharmacies. Order states are read-only here to avoid bypassing inventory and refund workflows.</p>
                </div>
                <label className="flex min-h-[40px] items-center gap-2 rounded-[10px] border border-[#DDE7E4] bg-white px-3 text-[#5B7479]">
                    <Icon d={ICONS.search} className="h-4 w-4" />
                    <input
                        type="search"
                        value={orderQuery}
                        onChange={(event) => setOrderQuery(event.target.value)}
                        placeholder="Search order, pharmacy, customer"
                        aria-label="Search orders"
                        className="w-56 bg-transparent text-[13px] text-[#0F2A2E] outline-none placeholder:text-[#5B7479]"
                    />
                </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter orders by status">
                {["all", ...new Set(orders.map((order) => order.status))].map((status) => (
                    <button
                        key={status}
                        onClick={() => setOrderStatusFilter(status)}
                        aria-pressed={orderStatusFilter === status}
                        className={`min-h-[36px] rounded-full px-3 text-xs font-semibold capitalize ${orderStatusFilter === status ? "bg-[#0B3B3A] text-white" : "border border-[#DDE7E4] bg-white text-[#3E5A5F]"}`}
                    >
                        {displayStatus(status)}
                    </button>
                ))}
            </div>
            <div className="mt-4 space-y-3">
                {!loading && filteredOrders.length === 0 && <Empty>No orders match this search or status.</Empty>}
                {filteredOrders.map((order) => {
                    const pharmacy = pharmaciesById.get(order.pharmacy_id);
                    return (
                        <article key={order.id} className="rounded-xl border border-[#E3ECE9] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-[220px] flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <strong className="text-sm">{order.order_number || `Order ${order.id.slice(0, 8)}`}</strong>
                                        <span className="rounded-full bg-[#F0F5F3] px-2.5 py-1 text-[11px] font-bold capitalize text-[#3E5A5F]">
                                            {order.status === "pending" && order.quote_sent_at ? "quote awaiting customer" : displayStatus(order.status)}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm font-semibold">{order.customer_name} · {maskedPhone(order.customer_phone)}</p>
                                    <p className="mt-1 text-xs text-[#5B7479]">
                                        {pharmacy?.name || "Pharmacy unavailable"} · {new Date(order.created_at).toLocaleString("en-IN")}
                                    </p>
                                    {order.delivery_address && <p className="mt-1 break-words text-xs text-[#5B7479]">{order.delivery_address}</p>}
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-extrabold">{inr(order.final_total ?? order.quoted_subtotal ?? order.subtotal)}</p>
                                    <p className="mt-1 text-xs capitalize text-[#5B7479]">{order.fulfillment_choice || "fulfillment not selected"}</p>
                                </div>
                            </div>
                            {pharmacy && (
                                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#E3ECE9] pt-3">
                                    <button
                                        onClick={() => {
                                            setFState(pharmacy.state);
                                            setFDistrict(pharmacy.district);
                                            setFCity(pharmacy.city);
                                            setFPharmacy(pharmacy.id);
                                            go("explorer");
                                        }}
                                        className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#0E7C6B]"
                                    >
                                        Pharmacy performance
                                    </button>
                                    <button
                                        onClick={() => {
                                            setStatusFilter("all");
                                            setExpandedPharmacyId(pharmacy.id);
                                            go("verification");
                                        }}
                                        className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#3E5A5F]"
                                    >
                                        Pharmacy verification
                                    </button>
                                    <button
                                        onClick={() => {
                                            setInventoryQuery(pharmacy.name);
                                            go("inventory");
                                        }}
                                        className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#3E5A5F]"
                                    >
                                        Pharmacy stock
                                    </button>
                                </div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-[#E3ECE9] pt-3">
                                <button
                                    onClick={() => {
                                        setCustomerQuery(order.customer_name);
                                        go("customers");
                                    }}
                                    className="min-h-[38px] rounded-lg border border-[#DDE7E4] bg-white px-3 text-xs font-bold text-[#3E5A5F]"
                                >
                                    Customer activity
                                </button>
                            </div>
                        </article>
                    );
                })}
            </div>
        </Card>
    );

    const inventoryView = (
        <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-base font-bold">Partner stock</h2>
                    <p className="mt-1 text-xs text-[#5B7479]">Stock and expiry snapshot across pharmacies. Inventory changes are made by the pharmacy in its partner dashboard.</p>
                </div>
                <label className="flex min-h-[40px] items-center gap-2 rounded-[10px] border border-[#DDE7E4] bg-white px-3 text-[#5B7479]">
                    <Icon d={ICONS.search} className="h-4 w-4" />
                    <input
                        type="search"
                        value={inventoryQuery}
                        onChange={(event) => setInventoryQuery(event.target.value)}
                        placeholder="Search pharmacy or medicine"
                        aria-label="Search inventory"
                        className="w-56 bg-transparent text-[13px] text-[#0F2A2E] outline-none placeholder:text-[#5B7479]"
                    />
                </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-[#F0F5F3] p-4"><p className="text-xs font-semibold text-[#5B7479]">Medicine entries</p><p className="mt-1 text-xl font-extrabold">{num(inventoryRows.length)}</p></div>
                <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-800">Low / out of stock</p><p className="mt-1 text-xl font-extrabold text-amber-900">{num(inventoryRows.filter((row) => ["low stock", "out of stock"].includes(stockCondition(row))).length)}</p></div>
                <div className="rounded-xl bg-rose-50 p-4"><p className="text-xs font-semibold text-rose-800">Expired / expiring</p><p className="mt-1 text-xl font-extrabold text-rose-900">{num(inventoryRows.filter((row) => ["expired", "expiring"].includes(stockCondition(row))).length)}</p></div>
            </div>
            <div className="mt-5 overflow-x-auto rounded-xl border border-[#E3ECE9]">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[#F8FBFA] text-xs uppercase tracking-wide text-[#5B7479]">
                        <tr><th className="px-4 py-3">Pharmacy</th><th className="px-4 py-3">Medicine</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Nearest expiry</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3ECE9]">
                        {filteredInventory.map((row) => {
                            const condition = stockCondition(row);
                            const pharmacy = pharmaciesById.get(row.pharmacy_id);
                            return (
                                <tr key={`${row.pharmacy_id}-${row.medicine_id}`}>
                                    <td className="px-4 py-3"><p className="font-bold">{row.pharmacy_name}</p><p className="text-xs text-[#5B7479]">{row.city}, {row.state}</p></td>
                                    <td className="px-4 py-3"><p className="font-semibold">{row.medicine_name}</p>{row.generic_name && <p className="text-xs text-[#5B7479]">{row.generic_name}</p>}</td>
                                    <td className="px-4 py-3 font-semibold">{num(row.quantity_on_hand)} <span className="font-normal text-[#5B7479]">/ reorder {num(row.reorder_level)}</span></td>
                                    <td className="px-4 py-3">{row.nearest_expiry ? new Date(row.nearest_expiry).toLocaleDateString("en-IN") : "—"}</td>
                                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${condition === "in stock" ? "bg-[#E3F6F0] text-[#0A7A5A]" : condition === "low stock" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800"}`}>{condition}</span></td>
                                    <td className="px-4 py-3 text-right">
                                        {pharmacy && <button onClick={() => { setFState(pharmacy.state); setFDistrict(pharmacy.district); setFCity(pharmacy.city); setFPharmacy(pharmacy.id); go("explorer"); }} className="font-bold text-[#0E7C6B]">Sales ↗</button>}
                                    </td>
                                </tr>
                            );
                        })}
                        {!loading && filteredInventory.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#5B7479]">No inventory entries match this search.</td></tr>}
                    </tbody>
                </table>
            </div>
        </Card>
    );

    const customersView = (
        <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-base font-bold">Customer activity</h2>
                    <p className="mt-1 text-xs text-[#5B7479]">Aggregated from order history. Phone numbers are masked in this admin report.</p>
                </div>
                <label className="flex min-h-[40px] items-center gap-2 rounded-[10px] border border-[#DDE7E4] bg-white px-3 text-[#5B7479]">
                    <Icon d={ICONS.search} className="h-4 w-4" />
                    <input
                        type="search"
                        value={customerQuery}
                        onChange={(event) => setCustomerQuery(event.target.value)}
                        placeholder="Search customer"
                        aria-label="Search customers"
                        className="w-48 bg-transparent text-[13px] text-[#0F2A2E] outline-none placeholder:text-[#5B7479]"
                    />
                </label>
            </div>
            <div className="mt-5 overflow-x-auto rounded-xl border border-[#E3ECE9]">
                <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-[#F8FBFA] text-xs uppercase tracking-wide text-[#5B7479]">
                        <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">Completed</th><th className="px-4 py-3">Completed sales</th><th className="px-4 py-3">Last order</th><th className="px-4 py-3"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3ECE9]">
                        {filteredCustomers.map((customer) => (
                            <tr key={customer.customer_key}>
                                <td className="px-4 py-3"><p className="font-bold">{customer.customer_name || "Customer"}</p><p className="text-xs text-[#5B7479]">{maskedPhone(customer.customer_phone || "")}</p></td>
                                <td className="px-4 py-3">{num(customer.orders)}</td>
                                <td className="px-4 py-3">{num(customer.completed_orders)}</td>
                                <td className="px-4 py-3 font-semibold">{inr(customer.completed_sales)}</td>
                                <td className="px-4 py-3">{new Date(customer.last_order_at).toLocaleDateString("en-IN")}</td>
                                <td className="px-4 py-3 text-right"><button onClick={() => { setOrderQuery(customer.customer_name); setOrderStatusFilter("all"); go("orders"); }} className="font-bold text-[#0E7C6B]">Orders ↗</button></td>
                            </tr>
                        ))}
                        {!loading && filteredCustomers.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#5B7479]">No customers match this search.</td></tr>}
                    </tbody>
                </table>
            </div>
        </Card>
    );

    const bloodGroupsView = (
        <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-base font-bold">Patient blood group directory</h2>
                    <p className="mt-1 text-xs text-[#5B7479]">Customer profile details and contact information.</p>
                </div>
                <p className="text-xs font-semibold text-[#5B7479]">{num(filteredPatientProfiles.length)} patients</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <label className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#DDE7E4] bg-white px-3 text-[#5B7479]">
                    <Icon d={ICONS.search} className="h-4 w-4 shrink-0" />
                    <input
                        type="search"
                        value={patientNameQuery}
                        onChange={(event) => setPatientNameQuery(event.target.value)}
                        placeholder="Search patient name"
                        aria-label="Search patient name"
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#0F2A2E] outline-none placeholder:text-[#5B7479]"
                    />
                </label>
                <label className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#DDE7E4] bg-white px-3 text-[#5B7479]">
                    <Icon d={ICONS.search} className="h-4 w-4 shrink-0" />
                    <input
                        type="search"
                        value={patientCityQuery}
                        onChange={(event) => setPatientCityQuery(event.target.value)}
                        placeholder="Search city"
                        aria-label="Search city"
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#0F2A2E] outline-none placeholder:text-[#5B7479]"
                    />
                </label>
                <label className="flex min-h-[44px] flex-col justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#5B7479]">
                    Blood group
                    <select
                        value={patientBloodGroupFilter}
                        onChange={(event) => setPatientBloodGroupFilter(event.target.value)}
                        aria-label="Filter by blood group"
                        className="min-h-[44px] rounded-[10px] border border-[#DDE7E4] bg-white px-3 text-[13px] font-semibold normal-case tracking-normal text-[#0F2A2E]"
                    >
                        <option value="">All blood groups</option>
                        {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="mt-5 overflow-x-auto rounded-xl border border-[#E3ECE9]">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[#F8FBFA] text-xs uppercase tracking-wide text-[#5B7479]">
                        <tr><th className="px-4 py-3">Patient name</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">Blood group</th><th className="px-4 py-3">City / district</th><th className="px-4 py-3">Phone number</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3ECE9]">
                        {filteredPatientProfiles.map((patient) => (
                            <tr key={patient.id}>
                                <td className="px-4 py-3 font-bold">{patient.full_name || "Patient"}</td>
                                <td className="px-4 py-3">{patient.age ?? "—"}</td>
                                <td className="px-4 py-3">
                                    {patient.blood_group
                                        ? <span className="rounded-full bg-[#FDE7EC] px-2.5 py-1 text-xs font-bold text-[#9F1239]">{patient.blood_group}</span>
                                        : "—"}
                                </td>
                                <td className="px-4 py-3">{[patient.city, patient.district].filter(Boolean).join(", ") || "—"}</td>
                                <td className="px-4 py-3">{patient.phone || "—"}</td>
                            </tr>
                        ))}
                        {!loading && filteredPatientProfiles.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[#5B7479]">No patients match these filters.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );

    const medicinesView = (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1 rounded-[10px] bg-[#F0F5F3] p-1" role="tablist" aria-label="Filter medicines">
                    {([
                        ["all", "All"],
                        ["selling", "Selling"],
                        ["nosales", "No sales yet"],
                        ["notstocked", "Not stocked"],
                    ] as const).map(([k, label]) => (
                        <button
                            key={k}
                            role="tab"
                            aria-selected={medFilter === k}
                            onClick={() => setMedFilter(k)}
                            className={`min-h-[36px] whitespace-nowrap rounded-[7px] px-3 text-xs font-semibold transition-colors ${medFilter === k ? "bg-white text-[#0F2A2E] shadow-sm" : "text-[#5B7479] hover:text-[#0F2A2E]"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <label className="flex min-h-[40px] items-center gap-2 rounded-[10px] bg-[#F0F5F3] px-3 text-[#5B7479]">
                    <Icon d={ICONS.search} className="h-4 w-4" />
                    <input
                        type="search"
                        value={medQuery}
                        onChange={(e) => setMedQuery(e.target.value)}
                        placeholder="Search medicine…"
                        aria-label="Search medicine"
                        className="w-48 bg-transparent text-[13px] text-[#0F2A2E] outline-none placeholder:text-[#5B7479]"
                    />
                </label>
            </div>

            <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                    <thead>
                        <tr className="bg-[#F0F5F3] text-[11px] font-bold uppercase tracking-wider text-[#5B7479]">
                            {["Medicine", "Stocked by", "Units sold", "Revenue", "Gross profit", "Status"].map((x, i) => (
                                <th key={x} className={`px-3.5 py-2.5 ${i === 0 ? "rounded-l-[10px]" : ""} ${i === 5 ? "rounded-r-[10px]" : ""}`}>{x}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleMedicines.map((m) => {
                            const stocked = Number(m.pharmacies_selling) > 0;
                            const sold = Number(m.units_sold) > 0;
                            const badge = !stocked
                                ? { t: "Not stocked", c: "bg-[#FDE7EC] text-[#9F1239]" }
                                : !sold
                                    ? { t: "No sales yet", c: "bg-[#FDEFD9] text-[#9A3412]" }
                                    : { t: "Selling", c: "bg-[#E3F6F0] text-[#0A7A5A]" };
                            return (
                                <tr key={m.medicine_id} className="border-b border-[#EDF3F1] last:border-0 hover:bg-[#F8FBFA]">
                                    <td className="px-3.5 py-3.5 font-semibold">{m.medicine_name}</td>
                                    <td className="px-3.5 py-3.5">{m.pharmacies_selling}</td>
                                    <td className="px-3.5 py-3.5">{num(m.units_sold)}</td>
                                    <td className="px-3.5 py-3.5 font-semibold">{inr(m.sales_revenue)}</td>
                                    <td className="px-3.5 py-3.5">{inr(m.gross_profit)}</td>
                                    <td className="px-3.5 py-3.5">
                                        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.c}`}>{badge.t}</span>
                                    </td>
                                </tr>
                            );
                        })}
                        {!loading && filteredMedicines.length === 0 && (
                            <tr><td colSpan={6} className="px-3.5 py-10 text-center text-sm text-[#5B7479]">No medicines match.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-[#5B7479]">
                <span>Showing {visibleMedicines.length} of {filteredMedicines.length} medicines</span>
                {filteredMedicines.length > 12 && (
                    <button onClick={() => setShowAllMeds((v) => !v)} className="min-h-[36px] font-bold text-[#0E7C6B]">
                        {showAllMeds ? "Show less" : "Show all"}
                    </button>
                )}
            </div>
        </Card>
    );

    /* ---------- revenue explorer: derived values ---------- */
    const curSeries = series.slice(-exRange);
    const prevSeries = series.slice(0, Math.max(0, series.length - exRange));
    const sumSeries = (rows: SeriesRow[], k: "sales_revenue" | "gross_profit" | "orders") =>
        rows.reduce((s, r) => s + Number(r[k] || 0), 0);
    const periodRevenue = sumSeries(curSeries, "sales_revenue");
    const prevRevenue = sumSeries(prevSeries, "sales_revenue");
    const periodDelta = prevRevenue > 0 ? ((periodRevenue - prevRevenue) / prevRevenue) * 100 : null;
    const exChart = curSeries.map((d) => ({
        day: new Date(d.day).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }),
        revenue: Number(d.sales_revenue || 0),
        profit: Number(d.gross_profit || 0),
    }));
    const maxTopMed = Math.max(1, ...selMeds.map((m) => Number(m.sales_revenue || 0)));
    const maxGroupRevenue = Math.max(1, ...groups.map((g) => g.revenue));
    const selectedPharmacy = fPharmacy ? pharmacies.find((p) => p.id === fPharmacy) : undefined;
    const selectedPerf = fPharmacy ? perf.find((p) => p.pharmacy_id === fPharmacy) : undefined;
    const levelLabel = { state: "By state", district: "By district", city: "By city / town", pharmacy: "By pharmacy" }[level];
    const hasFilter = !!(fState || fDistrict || fCity || fPharmacy);

    function exportCsv() {
        downloadCsv(
            `revenue-${[fState, fDistrict, fCity].filter(Boolean).join("-") || "all"}.csv`,
            [
                [levelLabel.replace("By ", "").toUpperCase(), "Pharmacies", "Orders", "Units sold", "Revenue", "Gross profit"],
                ...groups.map((g) => [g.label, g.pharmacies, g.orders, g.units, g.revenue, g.profit]),
            ]
        );
    }

    const crumbs: Array<{ label: string; onClick: () => void }> = [{ label: "All regions", onClick: () => pickState("") }];
    if (fState) crumbs.push({ label: titleCase(fState), onClick: () => pickState(fState) });
    if (fDistrict) crumbs.push({ label: titleCase(fDistrict), onClick: () => pickDistrict(fDistrict) });
    if (fCity) crumbs.push({ label: titleCase(fCity), onClick: () => pickCity(fCity) });
    if (fPharmacy && selectedPerf) crumbs.push({ label: selectedPerf.pharmacy_name, onClick: () => undefined });

    const explorerKpis = [
        { label: "Total revenue", value: inr(selTotals.revenue), sub: hasFilter ? "In this selection · all time" : "Everywhere · all time", icon: ICONS.rupee, tone: "bg-[#E3F6F0] text-[#0E7C6B]", bar: "bg-[#0E7C6B]" },
        { label: "Gross profit", value: inr(selTotals.profit), sub: `${selTotals.margin.toFixed(1)}% margin`, icon: ICONS.chart, tone: "bg-[#FDEFD9] text-[#B45309]", bar: "bg-[#E8913A]" },
        { label: "Orders", value: num(selTotals.orders), sub: `${inr(Math.round(selTotals.aov))} average order`, icon: ICONS.cart, tone: "bg-[#E8EEFB] text-[#3558C8]", bar: "bg-[#3558C8]" },
        { label: "Pharmacies", value: num(selRows.length), sub: `${num(selTotals.units)} units sold`, icon: ICONS.store, tone: "bg-[#F1ECFB] text-[#6D47C2]", bar: "bg-[#6D47C2]" },
    ];

    const explorerView = (
        <>
            {/* filters */}
            <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-bold">Choose where to look</h2>
                    {hasFilter && (
                        <button onClick={() => pickState("")} className="min-h-[36px] text-[13px] font-bold text-[#0E7C6B]">
                            Reset filters
                        </button>
                    )}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                    <Select label="State" value={fState} onChange={pickState} placeholder="All states" options={stateOptions.map((v) => ({ value: v, label: titleCase(v) }))} />
                    <Select label="District" value={fDistrict} onChange={pickDistrict} disabled={!fState} placeholder="All districts" options={districtOptions.map((v) => ({ value: v, label: titleCase(v) }))} />
                    <Select label="City / town" value={fCity} onChange={pickCity} disabled={!fDistrict} placeholder="All cities" options={cityOptions.map((v) => ({ value: v, label: titleCase(v) }))} />
                    <Select label="Pharmacy" value={fPharmacy} onChange={setFPharmacy} disabled={!fCity} placeholder="All pharmacies" options={pharmacyOptions.map((p) => ({ value: p.pharmacy_id, label: p.pharmacy_name }))} />
                </div>
                <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px]">
                    {crumbs.map((c, i) => (
                        <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                            {i > 0 && <span className="text-[#9BB0AC]">›</span>}
                            <button
                                onClick={c.onClick}
                                aria-current={i === crumbs.length - 1 ? "page" : undefined}
                                className={i === crumbs.length - 1 ? "font-bold text-[#0F2A2E]" : "font-semibold text-[#0E7C6B] hover:underline"}
                            >
                                {c.label}
                            </button>
                        </span>
                    ))}
                </nav>
            </Card>

            {/* KPIs for the selection */}
            <section aria-label="Selection totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {explorerKpis.map((k) => (
                    <div key={k.label} className="relative overflow-hidden rounded-2xl border border-[#E3ECE9] bg-white p-5 shadow-[0_1px_2px_rgba(15,42,46,0.04)]">
                        <span className={`absolute inset-x-0 top-0 h-1 ${k.bar}`} />
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-[#5B7479]">{k.label}</span>
                            <span className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${k.tone}`}>
                                <Icon d={k.icon} />
                            </span>
                        </div>
                        <p className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight">{k.value}</p>
                        <p className="mt-1 text-xs font-medium text-[#5B7479]">{k.sub}</p>
                    </div>
                ))}
            </section>

            {/* single pharmacy detail */}
            {selectedPerf && (
                <Card>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#E3F6F0] text-lg font-extrabold text-[#0E7C6B]">
                            {initials(selectedPerf.pharmacy_name)}
                        </div>
                        <div className="min-w-[200px] flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-extrabold">{selectedPerf.pharmacy_name}</h2>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${STATUS_STYLE[(selectedPerf.verification_status || "pending") as Status]}`}>
                                    {selectedPerf.verification_status || "pending"}
                                </span>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${selectedPerf.is_active ? "bg-[#E3F6F0] text-[#0A7A5A]" : "bg-[#F0F5F3] text-[#5B7479]"}`}>
                                    {selectedPerf.is_active ? "Live" : "Not live"}
                                </span>
                            </div>
                            <p className="mt-1 text-sm capitalize text-[#5B7479]">
                                {selectedPerf.city}, {selectedPerf.district}, {selectedPerf.state}
                                {selectedPharmacy?.phone ? ` · ${selectedPharmacy.phone}` : ""}
                            </p>
                        </div>
                        <button onClick={() => go("verification")} className="min-h-[44px] rounded-[10px] border border-[#DDE7E4] bg-white px-4 text-[13px] font-bold text-[#3E5A5F] hover:bg-[#F0F5F3]">
                            Manage verification
                        </button>
                    </div>
                </Card>
            )}

            {/* revenue over time for the selection */}
            <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold">Revenue over time</h2>
                        <p className="mt-0.5 text-xs text-[#5B7479]">
                            {hasFilter ? crumbs[crumbs.length - 1].label : "All regions"} · completed orders
                        </p>
                    </div>
                    <div className="flex gap-1 rounded-[10px] bg-[#F0F5F3] p-1">
                        {([7, 30] as const).map((r) => (
                            <button
                                key={r}
                                onClick={() => setExRange(r)}
                                aria-pressed={exRange === r}
                                className={`min-h-[36px] rounded-[7px] px-3.5 text-xs font-semibold transition-colors ${exRange === r ? "bg-white text-[#0F2A2E] shadow-sm" : "text-[#5B7479] hover:text-[#0F2A2E]"
                                    }`}
                            >
                                {r}D
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <p className="text-2xl font-extrabold tracking-tight">{inr(periodRevenue)}</p>
                    {periodDelta !== null ? (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${periodDelta >= 0 ? "bg-[#E3F6F0] text-[#0A7A5A]" : "bg-[#FDE7EC] text-[#9F1239]"}`}>
                            {periodDelta >= 0 ? "▲" : "▼"} {Math.abs(periodDelta).toFixed(1)}% vs previous {exRange} days
                        </span>
                    ) : (
                        <span className="text-xs font-medium text-[#5B7479]">No earlier period to compare yet</span>
                    )}
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#3E5A5F]"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#0E7C6B]" />Revenue</span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#3E5A5F]"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#E8913A]" />Gross profit</span>
                </div>
                <div className={`mt-3 h-60 transition-opacity ${exLoading ? "opacity-50" : ""}`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={exChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="#E3ECE9" vertical={false} />
                            <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#5B7479" interval="preserveStartEnd" />
                            <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#5B7479" width={52} tickFormatter={(v) => (Number(v) >= 1000 ? `₹${Number(v) / 1000}K` : `₹${v}`)} />
                            <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 10, border: "1px solid #DDE7E4", fontSize: 12 }} />
                            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0E7C6B" fill="#0E7C6B" fillOpacity={0.12} strokeWidth={3} />
                            <Area type="monotone" dataKey="profit" name="Gross profit" stroke="#E8913A" fill="#E8913A" fillOpacity={0.1} strokeWidth={3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* breakdown + top medicines */}
            <div className="grid gap-4 xl:grid-cols-3">
                {!fPharmacy && (
                    <Card className="xl:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-base font-bold">{levelLabel}</h2>
                                <p className="mt-0.5 text-xs text-[#5B7479]">
                                    {level === "pharmacy" ? "Select a pharmacy to see its details." : "Click a row to drill down."}
                                </p>
                            </div>
                            <button
                                onClick={exportCsv}
                                disabled={groups.length === 0}
                                className="flex min-h-[40px] items-center gap-2 rounded-[10px] border border-[#DDE7E4] bg-white px-3.5 text-[13px] font-bold text-[#3E5A5F] hover:bg-[#F0F5F3] disabled:opacity-50"
                            >
                                <Icon d={ICONS.download} className="h-4 w-4" /> Export CSV
                            </button>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[720px] text-left text-sm">
                                <thead>
                                    <tr className="bg-[#F0F5F3] text-[11px] font-bold uppercase tracking-wider text-[#5B7479]">
                                        {[levelLabel.replace("By ", ""), level === "pharmacy" ? "Status" : "Pharmacies", "Orders", "Units sold", "Revenue", "Gross profit", "Share"].map((x, i) => (
                                            <th key={x} className={`px-3.5 py-2.5 ${i === 0 ? "rounded-l-[10px]" : ""} ${i === 6 ? "rounded-r-[10px]" : ""}`}>{x}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {groups.map((g) => (
                                        <tr key={g.key} className="border-b border-[#EDF3F1] last:border-0 hover:bg-[#F8FBFA]">
                                            <td className="px-3.5 py-3.5">
                                                <button onClick={() => drill(g.key)} className="text-left font-semibold text-[#0F2A2E] hover:text-[#0E7C6B]">
                                                    <span className="capitalize">{g.label}</span> <span className="text-[#0E7C6B]">→</span>
                                                    {g.sub && <span className="block text-xs font-normal capitalize text-[#5B7479]">{g.sub}</span>}
                                                </button>
                                            </td>
                                            <td className="px-3.5 py-3.5">
                                                {level === "pharmacy" ? (
                                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${STATUS_STYLE[(g.status || "pending") as Status]}`}>{g.status || "pending"}</span>
                                                ) : (
                                                    g.pharmacies
                                                )}
                                            </td>
                                            <td className="px-3.5 py-3.5">{num(g.orders)}</td>
                                            <td className="px-3.5 py-3.5">{num(g.units)}</td>
                                            <td className="px-3.5 py-3.5 font-semibold">{inr(g.revenue)}</td>
                                            <td className="px-3.5 py-3.5">{inr(g.profit)}</td>
                                            <td className="w-36 px-3.5 py-3.5">
                                                <div className="h-2.5 rounded-full bg-[#EDF3F1]">
                                                    <div className="h-2.5 rounded-full bg-[#0E7C6B]" style={{ width: `${(g.revenue / maxGroupRevenue) * 100}%` }} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {!loading && groups.length === 0 && (
                                        <tr><td colSpan={7} className="px-3.5 py-10 text-center text-sm text-[#5B7479]">No pharmacies in this area yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                <Card className={fPharmacy ? "xl:col-span-3" : ""}>
                    <h2 className="text-base font-bold">Top medicines here</h2>
                    <p className="mt-0.5 text-xs text-[#5B7479]">By revenue, for the current selection</p>
                    <div className="mt-4 space-y-4">
                        {selMeds.length === 0 && <Empty>No medicine sales in this selection yet.</Empty>}
                        {selMeds.map((m, i) => (
                            <div key={m.medicine_name}>
                                <div className="flex justify-between gap-3 text-[13px]">
                                    <span className="truncate font-semibold">{m.medicine_name}</span>
                                    <b>{inr(m.sales_revenue)}</b>
                                </div>
                                <div className="mt-1.5 h-2.5 rounded-full bg-[#EDF3F1]">
                                    <div className="h-2.5 rounded-full bg-[#0E7C6B]" style={{ width: `${(Number(m.sales_revenue) / maxTopMed) * 100}%`, opacity: 1 - i * 0.1 }} />
                                </div>
                                <p className="mt-1 text-[11px] text-[#5B7479]">{num(m.units_sold)} units · profit {inr(m.gross_profit)}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </>
    );

    const content: Record<View, React.ReactNode> = {
        overview,
        verification,
        orders: ordersView,
        inventory: inventoryView,
        customers: customersView,
        "blood-groups": bloodGroupsView,
        medicines: medicinesView,
        explorer: explorerView,
    };

    /* ================= shell ================= */
    return (
        <div className="min-h-screen bg-[#F3F6F5] text-[#0F2A2E] lg:flex">
            {/* sidebar (desktop) */}
            <aside className="hidden w-64 shrink-0 flex-col gap-7 bg-[#0B3B3A] p-5 text-[#CFE6E1] lg:sticky lg:top-0 lg:flex lg:h-screen">
                <div className="flex items-center gap-3 px-2 pt-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#2DD4A8] text-[#0B3B3A]">
                        <Icon d="M12 5v14M5 12h14" />
                    </div>
                    <span className="text-[17px] font-extrabold tracking-tight text-white">CareNexa</span>
                </div>

                <nav className="flex flex-col gap-1" aria-label="Admin sections">
                    {nav.map((n) => (
                        <button
                            key={n.id}
                            onClick={() => go(n.id)}
                            aria-current={view === n.id ? "page" : undefined}
                            className={`flex min-h-[44px] items-center gap-3 rounded-[10px] px-3 text-left text-sm font-medium transition-colors hover:bg-[#14524F] hover:text-white ${view === n.id ? "bg-[#14524F] text-white" : ""
                                }`}
                        >
                            <Icon d={n.icon} />
                            {n.label}
                            {!!n.badge && (
                                <span className="ml-auto rounded-full bg-[#F59E0B] px-2 py-0.5 text-[11px] font-bold text-[#3B2500]">{n.badge}</span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="mt-auto space-y-3">
                    {stats.pending > 0 && view !== "verification" && (
                        <div className="rounded-2xl bg-[#10504D] p-4">
                            <p className="text-[11px] font-semibold tracking-wider text-[#8FD3C4]">LICENCE CHECK</p>
                            <p className="mt-1.5 text-sm font-semibold leading-snug text-white">
                                {stats.pending} pharmac{stats.pending === 1 ? "y is" : "ies are"} waiting for review
                            </p>
                            <button onClick={() => go("verification")} className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-[#2DD4A8] text-[13px] font-bold text-[#0B3B3A]">
                                Review now
                            </button>
                        </div>
                    )}
                    <Link to="/" className="block px-3 py-2 text-sm text-[#8FD3C4] hover:text-white">← Back to home</Link>
                </div>
            </aside>

            <main className="min-w-0 flex-1 px-5 pb-12 pt-6 md:px-9">
                <div className="mx-auto flex max-w-6xl flex-col gap-6">
                    {/* mobile nav */}
                    <div className="lg:hidden">
                        <Link to="/" className="text-sm font-medium text-[#0E7C6B]">← Home</Link>
                        <nav className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Admin sections">
                            {nav.map((n) => (
                                <button
                                    key={n.id}
                                    onClick={() => go(n.id)}
                                    aria-current={view === n.id ? "page" : undefined}
                                    className={`flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-semibold ${view === n.id ? "bg-[#0B3B3A] text-white" : "border border-[#DDE7E4] bg-white text-[#3E5A5F]"
                                        }`}
                                >
                                    {n.label}
                                    {!!n.badge && <span className="rounded-full bg-[#F59E0B] px-1.5 text-[11px] font-bold text-[#3B2500]">{n.badge}</span>}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* page header */}
                    <header className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-[13px] font-medium text-[#5B7479]">
                                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                            </p>
                            <h1 className="text-[28px] font-extrabold tracking-tight">{VIEW_META[view].title}</h1>
                            <p className="mt-1 text-sm text-[#5B7479]">{VIEW_META[view].subtitle}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setLoading(true);
                                    void load();
                                }}
                                disabled={loading}
                                className="min-h-[40px] rounded-xl border border-[#DDE7E4] bg-white px-3 text-[13px] font-semibold text-[#3E5A5F] hover:bg-[#F0F5F3] disabled:opacity-50"
                            >
                                {loading ? "Refreshing…" : "Refresh data"}
                            </button>
                            <div className="hidden items-center gap-2 rounded-xl border border-[#DDE7E4] bg-white px-3 py-1.5 sm:flex">
                                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#0E7C6B] text-sm font-bold text-white">AD</span>
                                <span className="pr-1 text-[13px] font-semibold">Admin</span>
                            </div>
                            <button
                                type="button"
                                onClick={signOut}
                                disabled={signingOut}
                                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#DDE7E4] bg-white px-3 text-[13px] font-semibold text-[#3E5A5F] hover:bg-[#F0F5F3] disabled:cursor-wait disabled:opacity-60"
                            >
                                <LogOut size={16} />
                                {signingOut ? "Signing out…" : "Sign out"}
                            </button>
                        </div>
                    </header>

                    {error && (
                        <p role="alert" className="rounded-xl border border-[#F5C2CC] bg-[#FDE7EC] p-4 text-sm font-medium text-[#9F1239]">
                            {error}
                        </p>
                    )}

                    {content[view]}
                </div>
            </main>
        </div>
    );
}
