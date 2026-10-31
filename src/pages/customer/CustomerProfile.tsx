import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, BadgeCheck, ChevronRight, HeartPulse, Pill, Settings2, ShoppingBag } from "lucide-react";
import { requireSupabase } from "@/lib/supabase";
import CustomerOrders from "@/components/customer/CustomerOrders";
import CustomerOverview from "@/components/customer/CustomerOverview";
import CustomerSettings from "@/components/customer/CustomerSettings";
import { loadApprovedPharmacies, loadCustomerOrders } from "@/components/customer/customerData";
import type { CustomerOrder, CustomerProfileUser, CustomerTab, PharmacyOption, PrescriptionOrder } from "@/components/customer/types";

const tabs: Array<{ id: CustomerTab; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "orders", label: "My orders", icon: ShoppingBag },
  { id: "profile", label: "Profile & settings", icon: Settings2 },
];

const pageCopy: Record<CustomerTab, { title: string; description: string }> = {
  overview: { title: "Overview", description: "Your requests, quotes, and account at a glance." },
  orders: { title: "Your orders", description: "Track pharmacy requests, quotes, and pickups." },
  profile: { title: "Profile & settings", description: "Review your customer details and account security." },
};

export default function CustomerProfile() {
  const [user, setUser] = useState<CustomerProfileUser | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [prescriptionOrders, setPrescriptionOrders] = useState<PrescriptionOrder[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
  const [pharmaciesLoaded, setPharmaciesLoaded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<CustomerTab>("overview");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let userId: string | null = null;
    let loaded = false;
    let refreshing = false;

    const refresh = async () => {
      if (!live || refreshing) return;
      refreshing = true;
      try {
        const db = requireSupabase();
        if (!userId) {
          const { data, error: authError } = await db.auth.getUser();
          if (authError) throw authError;
          if (!data.user) {
            setError("Please sign in to view your dashboard.");
            return;
          }
          userId = data.user.id;
          setUser(data.user);

          void loadApprovedPharmacies()
            .then((rows) => { if (live) setPharmacies(rows); })
            .catch(() => undefined)
            .finally(() => { if (live) setPharmaciesLoaded(true); });
        }

        const rows = await loadCustomerOrders(userId);
        if (live) {
          setOrders(rows.orders);
          setPrescriptionOrders(rows.prescriptions);
          loaded = true;
        }
      } catch (cause) {
        if (live && !loaded) setError(cause instanceof Error ? cause.message : "Could not load your dashboard.");
      } finally {
        refreshing = false;
        if (live) setLoading(false);
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      if (userId && document.visibilityState === "visible") void refresh();
    }, 20_000);

    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  async function refreshCustomerOrders() {
    if (!user) return;
    const rows = await loadCustomerOrders(user.id);
    setOrders(rows.orders);
    setPrescriptionOrders(rows.prescriptions);
  }

  async function retryPrescription(requestId: string, pharmacyId?: string) {
    setRetrying(requestId);
    setError("");
    try {
      const { data, error: retryError } = await requireSupabase().rpc("customer_retry_prescription_order", {
        p_request_id: requestId,
        p_pharmacy_id: pharmacyId || null,
      });
      if (retryError) throw retryError;
      if (!Number(data || 0)) setError("No approved pharmacy is available for that search. Choose another pharmacy and try again.");
      await refreshCustomerOrders();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restart the pharmacy search.");
    } finally {
      setRetrying(null);
    }
  }

  async function respondToQuote(orderId: string, accept: boolean) {
    if (!user) return;
    setBusyOrder(orderId);
    setError("");
    try {
      const { error: responseError } = await requireSupabase().rpc("customer_respond_to_pharmacy_quote", {
        p_order_id: orderId,
        p_accept: accept,
      });
      if (responseError) throw responseError;
      await refreshCustomerOrders();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not respond to the pharmacy quote.");
    } finally {
      setBusyOrder(null);
    }
  }

  async function signOut() {
    const { error: signOutError } = await requireSupabase().auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    window.location.assign("/");
  }

  const initials = (user?.user_metadata?.full_name || user?.email || "U").trim().slice(0, 1).toUpperCase();
  const currentCopy = pageCopy[tab];

  return <main className="min-h-screen bg-[#f3f7f5] text-[#10231b]">
    <header className="sticky top-0 z-20 border-b border-[#dfe8e3] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#10231b]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0b7a55] text-white"><Pill size={18} /></span>
          <span>CareNexa</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/" className="hidden min-h-10 items-center rounded-full border border-[#dfe8e3] px-4 text-sm font-semibold hover:border-[#0b7a55] sm:inline-flex">Find medicines</Link>
          <Link to="/hospitals" className="inline-flex min-h-10 items-center rounded-full border border-[#cde8d9] bg-[#eff8f3] px-4 text-sm font-semibold text-[#0b6a49] hover:border-[#0b7a55]">Find hospitals</Link>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#dff3ea] font-bold text-[#065c3f]" aria-label={`${user?.user_metadata?.full_name || "Customer"} account`}>{initials}</span>
        </div>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1180px] items-start gap-4 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-7">
      <aside className="flex flex-col gap-3 lg:sticky lg:top-[84px]">
        <div className="hidden items-center gap-3 border-b border-[#dfe8e3] px-1 pb-4 lg:flex">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dff3ea] font-bold text-[#065c3f]">{initials}</span>
          <div className="min-w-0"><p className="truncate text-sm font-bold">{user?.user_metadata?.full_name || "Customer account"}</p><p className="truncate text-xs text-[#5b6f66]">{user?.email || ""}</p></div>
        </div>
        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[#dfe8e3] bg-white p-1 lg:flex-col lg:border-0 lg:bg-transparent lg:p-0" aria-label="Customer space">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)} className={`flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold transition lg:w-full ${tab === id ? "bg-[#dff3ea] text-[#065c3f]" : "text-[#5b6f66] hover:bg-white hover:text-[#10231b]"}`}>
            <Icon size={17} /><span>{label}</span>{tab === id && <ChevronRight size={15} className="ml-auto hidden lg:block" />}
          </button>)}
        </nav>
        <div className="hidden rounded-2xl bg-[#0b7a55] p-4 text-white lg:block">
          <HeartPulse size={20} /><h2 className="mt-3 font-display text-base font-bold">Your health, made simpler.</h2><p className="mt-1 text-xs leading-5 text-white/85">Find nearby pharmacies and track every order in one place.</p><Link to="/#prescription-upload" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold">Search medicines <ArrowRight size={14} /></Link><Link to="/hospitals" className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold">Find hospitals <ArrowRight size={14} /></Link>
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[.09em] text-[#0b7a55]">Customer space</p><h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{tab === "overview" ? `Good to see you, ${user?.user_metadata?.full_name?.split(" ")[0] || "there"}.` : currentCopy.title}</h1><p className="mt-1.5 text-sm text-[#5b6f66]">{tab === "overview" ? "Here is where your prescriptions stand right now." : currentCopy.description}</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cde8d9] bg-white px-3 py-2 text-xs font-semibold text-[#0b6a49]"><BadgeCheck size={14} />Secure customer account</span>
        </div>

        {error && <div role="alert" className="mb-4 rounded-xl border border-[#f1d98a] bg-[#fff4d6] p-3.5 text-sm text-[#6b4a00]">{error}{!user && <Link to="/account" className="ml-1 font-bold underline">Sign in</Link>}</div>}

        {loading ? <div className="rounded-2xl border border-[#dfe8e3] bg-white p-10 text-center text-sm text-[#5b6f66]">Loading your customer space…</div> : !error && <>
          {tab === "overview" && <CustomerOverview user={user} orders={orders} prescriptions={prescriptionOrders} busyOrder={busyOrder} onRespond={respondToQuote} onNavigate={setTab} />}
          {tab === "orders" && <CustomerOrders requests={prescriptionOrders} orders={orders} pharmacies={pharmacies} pharmaciesLoaded={pharmaciesLoaded} busyOrder={busyOrder} retrying={retrying} onRetry={retryPrescription} onRespond={respondToQuote} />}
          {tab === "profile" && <CustomerSettings user={user} onSignOut={() => { void signOut(); }} />}
        </>}
      </section>
    </div>
  </main>;
}
