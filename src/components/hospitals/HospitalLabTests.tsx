import { useEffect, useMemo, useState } from "react";
import { Loader2, FlaskConical, Search } from "lucide-react";
import { requireSupabase } from "@/lib/supabase";

type DisplayItem = {
    id: string;
    name: string;
    category: string;
    price: number | null;
    originalPrice: number | null;
    description: string | null;
    duration: string | null;
    included: string[];
    url: string | null;
    isPackage: boolean;
    source: "lab" | "package";
};

type Props = {
    hospitalId: string;
};

export default function HospitalLabTests({ hospitalId }: Props) {
    const [items, setItems] = useState<DisplayItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [kind, setKind] = useState<"all" | "test" | "package">("all");

    useEffect(() => {
        let active = true;

        async function loadItems() {
            setLoading(true);
            setError("");

            try {
                const supabase = requireSupabase();

                // Lab tests live in hospital_lab_tests.
                // Health packages already added to the hospital directory live in hospital_packages.
                const [labResult, packageResult] = await Promise.all([
                    supabase
                        .from("hospital_lab_tests")
                        .select(
                            "id,hospital_id,test_name,category,tests_included,price,discounted_price,test_url,description,is_package,is_active"
                        )
                        .eq("hospital_id", hospitalId)
                        .eq("is_active", true)
                        .order("test_name"),
                    supabase
                        .from("hospital_packages")
                        .select(
                            "id,hospital_id,name,short_description,description,price,original_price,tests_included,services_included,duration,is_active"
                        )
                        .eq("hospital_id", hospitalId)
                        .eq("is_active", true)
                        .order("name"),
                ]);

                if (!active) return;

                // Keep showing data from either table if the other table is not available.
                const loaded: DisplayItem[] = [];

                if (!labResult.error) {
                    (labResult.data || []).forEach((row: any) => {
                        loaded.push({
                            id: `lab-${row.id}`,
                            name: row.test_name,
                            category: row.category || "Laboratory",
                            price: row.discounted_price ?? row.price ?? null,
                            originalPrice:
                                row.discounted_price != null &&
                                    row.price != null &&
                                    Number(row.price) > Number(row.discounted_price)
                                    ? Number(row.price)
                                    : null,
                            description: row.description || null,
                            duration: null,
                            included: Array.isArray(row.tests_included)
                                ? row.tests_included
                                : [],
                            url: row.test_url || null,
                            isPackage: Boolean(row.is_package),
                            source: "lab",
                        });
                    });
                }

                if (!packageResult.error) {
                    (packageResult.data || []).forEach((row: any) => {
                        const included = [
                            ...(Array.isArray(row.tests_included) ? row.tests_included : []),
                            ...(Array.isArray(row.services_included) ? row.services_included : []),
                        ];

                        loaded.push({
                            id: `package-${row.id}`,
                            name: row.name,
                            category: "Hospital health package",
                            price: row.price == null ? null : Number(row.price),
                            originalPrice:
                                row.original_price == null ? null : Number(row.original_price),
                            description: row.short_description || row.description || null,
                            duration: row.duration || null,
                            included,
                            url: null,
                            isPackage: true,
                            source: "package",
                        });
                    });
                }

                if (labResult.error && packageResult.error) {
                    throw new Error(
                        `Lab tests: ${labResult.error.message}. Hospital packages: ${packageResult.error.message}`
                    );
                }

                setItems(loaded);
            } catch (err) {
                console.error("Hospital lab tests/packages error:", err);
                if (active) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Unable to load this hospital's tests and packages."
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        if (hospitalId) void loadItems();
        else {
            setError("Hospital ID is missing.");
            setLoading(false);
        }

        return () => {
            active = false;
        };
    }, [hospitalId]);

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();

        return items.filter((item) => {
            const matchesSearch =
                !q ||
                item.name.toLowerCase().includes(q) ||
                item.category.toLowerCase().includes(q) ||
                (item.description || "").toLowerCase().includes(q) ||
                item.included.some((value) => value.toLowerCase().includes(q));

            const matchesKind =
                kind === "all" ||
                (kind === "package" ? item.isPackage : !item.isPackage);

            return matchesSearch && matchesKind;
        });
    }, [items, search, kind]);

    const formatPrice = (value: number | null) =>
        value == null ? "Contact hospital" : `₹${value.toLocaleString("en-IN")}`;

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-slate-500">
                <Loader2 className="animate-spin" size={18} />
                Loading lab tests and packages...
            </div>
        );
    }

    if (error) {
        return (
            <div
                role="alert"
                className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
            >
                Could not load lab tests and packages: {error}
                <p className="mt-2 text-xs">
                    Check the SELECT permissions on hospital_lab_tests and hospital_packages.
                </p>
            </div>
        );
    }

    return (
        <section className="space-y-5">
            <div>
                <div className="flex items-center gap-2">
                    <FlaskConical className="text-[#168f7e]" size={23} />
                    <h2 className="font-display text-2xl font-bold text-slate-900">
                        Lab Tests & Health Packages
                    </h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                    Browse tests and health packages listed by this hospital. Contact the
                    hospital to confirm current prices and availability.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                    <Search size={17} className="text-slate-400" />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search test or package..."
                        className="w-full bg-transparent text-sm outline-none"
                    />
                </label>

                <select
                    value={kind}
                    onChange={(event) =>
                        setKind(event.target.value as "all" | "test" | "package")
                    }
                    aria-label="Filter lab tests and packages"
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                    <option value="all">All tests & packages</option>
                    <option value="test">Individual tests</option>
                    <option value="package">Health packages</option>
                </select>
            </div>

            <p className="text-xs text-slate-500">
                {filteredItems.length} {kind === "package" ? "packages" : kind === "test" ? "tests" : "items"} found
            </p>

            {!filteredItems.length ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                    <FlaskConical className="mx-auto text-[#168f7e]" size={32} />
                    <h3 className="mt-3 font-semibold text-slate-900">
                        {items.length ? "No matching items found" : "No lab tests or packages listed"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                        {items.length
                            ? "Try another search or filter."
                            : "This hospital has not added lab tests or health packages to its directory yet."}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {filteredItems.map((item) => {
                        const hasDiscount =
                            item.price != null &&
                            item.originalPrice != null &&
                            item.originalPrice > item.price;

                        return (
                            <article
                                key={item.id}
                                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-medium uppercase tracking-wide text-[#168f7e]">
                                            {item.category}
                                        </p>
                                        <h3 className="mt-1 font-semibold text-slate-900">
                                            {item.name}
                                        </h3>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-[#e9f5f1] px-2.5 py-1 text-xs font-semibold text-[#176d5b]">
                                        {item.isPackage ? "Package" : "Lab test"}
                                    </span>
                                </div>

                                <div className="mt-4 flex flex-wrap items-baseline gap-2">
                                    <span className="text-xl font-bold text-slate-900">
                                        {formatPrice(item.price)}
                                    </span>
                                    {hasDiscount && (
                                        <span className="text-sm text-slate-400 line-through">
                                            {formatPrice(item.originalPrice)}
                                        </span>
                                    )}
                                </div>

                                {item.included.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-sm font-semibold text-slate-700">
                                            Included tests and services
                                        </p>
                                        <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-600">
                                            {item.included.map((value, index) => (
                                                <li key={`${item.id}-${index}`}>{value}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {item.description && (
                                    <p className="mt-3 text-sm text-slate-500">
                                        {item.description}
                                    </p>
                                )}

                                {item.duration && (
                                    <p className="mt-2 text-sm text-slate-500">
                                        <strong className="text-slate-700">Duration:</strong>{" "}
                                        {item.duration}
                                    </p>
                                )}

                                {item.url && (
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-4 inline-flex text-sm font-semibold text-[#087b69] hover:underline"
                                    >
                                        View test details →
                                    </a>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
