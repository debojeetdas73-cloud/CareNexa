import { ArrowRight, CheckCircle2, Clock3, MapPin, Pill, RotateCw, Settings2, ShoppingBag, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import CustomerOrderRow from "./CustomerOrderRow";
import { getPharmacyName, isOrderComplete, isQuotePending, needsPrescriptionRetry } from "./customerData";
import type { CustomerOrder, CustomerProfileUser, CustomerTab, PrescriptionOrder } from "./types";

const money = (amount: number) => `₹${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function CustomerOverview({
  user,
  orders,
  prescriptions,
  busyOrder,
  onRespond,
  onNavigate,
}: {
  user: CustomerProfileUser | null;
  orders: CustomerOrder[];
  prescriptions: PrescriptionOrder[];
  busyOrder: string | null;
  onRespond: (orderId: string, accept: boolean) => void;
  onNavigate: (tab: CustomerTab) => void;
}) {
  const pendingQuote = orders.find(isQuotePending);
  const needingAction = prescriptions.filter((request) => needsPrescriptionRetry(request));
  const completedOrders = orders.filter(isOrderComplete);
  const spend = completedOrders.reduce((sum, order) => sum + Number(order.final_total || 0), 0);
  const lastOrder = orders[0];
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "there";
  const requestCount = prescriptions.length + orders.filter((order) => !order.prescription_order_id).length;
  const waitingCount = orders.filter(isQuotePending).length + prescriptions.filter((request) => request.status === "accepted").length;

  const activity = [
    ...prescriptions.map((request) => ({
      id: request.id,
      time: request.created_at,
      tone: needsPrescriptionRetry(request) ? "bad" : request.status === "completed" ? "ok" : "wait",
      title: needsPrescriptionRetry(request)
        ? `Prescription ${request.id.slice(0, 8)} needs a new search`
        : request.status === "quoted"
          ? "A pharmacy sent your prescription quote"
          : request.status === "completed"
            ? "Prescription order completed"
            : "Prescription request sent",
      detail: `${request.fulfillment_choice === "delivery" ? "Home delivery" : "Store pickup"} · ${new Date(request.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
    })),
    ...orders.map((order) => ({
      id: order.id,
      time: order.created_at,
      tone: isOrderComplete(order) ? "ok" : isQuotePending(order) ? "wait" : "wait",
      title: isOrderComplete(order)
        ? `Order ${order.order_number || order.id.slice(0, 8)} completed`
        : isQuotePending(order)
          ? `${getPharmacyName(order) || "A pharmacy"} sent a quote`
          : `Order ${order.order_number || order.id.slice(0, 8)} updated`,
      detail: `${getPharmacyName(order) || "Pharmacy"} · ${order.fulfillment_choice || "Fulfillment pending"}${order.final_total != null ? ` · ${money(order.final_total)}` : ""}`,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5);

  const stats = [
    { label: "Requests sent", value: requestCount, icon: <ShoppingBag size={18} /> },
    { label: "Waiting on you", value: waitingCount + needingAction.length, icon: <Clock3 size={18} /> },
    { label: "Completed", value: completedOrders.length + prescriptions.filter((request) => request.status === "completed" && !request.order_id).length, icon: <CheckCircle2 size={18} /> },
    { label: "Spent on completed orders", value: money(spend), icon: <WalletCards size={18} /> },
  ];

  return (
    <div className="space-y-5">
      {pendingQuote ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#0b7a55] px-5 py-5 text-white shadow-sm sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.09em] text-white/75">Next step</p>
            <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">{getPharmacyName(pendingQuote) || "Your pharmacy"} sent a quote</h2>
            <p className="mt-1 text-sm text-white/85">Review the medicine list and final price of {money(Number(pendingQuote.final_total || 0))}.</p>
          </div>
          <button onClick={() => onNavigate("orders")} className="min-h-10 shrink-0 rounded-full bg-white px-4 text-sm font-bold text-[#065c3f] hover:bg-[#e9f7ef]">
            Review quote <ArrowRight className="ml-1 inline" size={15} />
          </button>
        </section>
      ) : needingAction.length > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#f1d98a] bg-[#fff4d6] px-5 py-4 text-[#6b4a00]">
          <div><p className="font-bold">{needingAction.length} prescription{needingAction.length === 1 ? " got" : "s got"} no reply</p><p className="mt-1 text-sm">Resend the request nearby or choose a pharmacy yourself.</p></div>
          <button onClick={() => onNavigate("orders")} className="min-h-10 rounded-full border border-current px-4 text-sm font-semibold hover:bg-white/50">Review requests</button>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Order summary">
        {stats.map((stat) => <div key={stat.label} className="flex items-center justify-between gap-3 rounded-2xl border border-[#dfe8e3] bg-white p-4 shadow-[0_1px_2px_rgba(16,35,27,.04)]">
          <div><p className="text-xs font-medium text-[#5b6f66]">{stat.label}</p><p className="mt-2 font-display text-2xl font-bold text-[#10231b]">{stat.value}</p></div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#dff3ea] text-[#0b6a49]">{stat.icon}</span>
        </div>)}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,.9fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#dfe8e3] bg-white shadow-[0_1px_2px_rgba(16,35,27,.04)]" aria-labelledby="customer-activity-title">
          <div className="flex items-center justify-between gap-3 border-b border-[#e7eee9] px-5 py-4">
            <div><h2 id="customer-activity-title" className="font-display text-lg font-bold text-[#10231b]">Recent activity</h2><p className="mt-1 text-sm text-[#5b6f66]">Your latest pharmacy updates</p></div>
            <button onClick={() => onNavigate("orders")} className="shrink-0 text-sm font-bold text-[#0b7a55] hover:text-[#065c3f]">All orders <ArrowRight className="ml-1 inline" size={14} /></button>
          </div>
          {activity.length ? <ul className="divide-y divide-[#e7eee9] px-5">
            {activity.map((entry) => <li key={`${entry.id}-${entry.title}`} className="flex gap-3 py-3.5">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${entry.tone === "bad" ? "bg-[#d6335a]" : entry.tone === "ok" ? "bg-[#0b7a55]" : "bg-[#d9a21b]"}`} />
              <div className="min-w-0"><p className="text-sm font-semibold text-[#10231b]">{entry.title}</p><p className="mt-0.5 text-xs text-[#5b6f66]">{entry.detail}</p></div>
            </li>)}
          </ul> : <p className="px-5 py-8 text-sm text-[#5b6f66]">Your requests and pharmacy updates will appear here.</p>}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-[#dfe8e3] bg-white p-5 shadow-[0_1px_2px_rgba(16,35,27,.04)]">
            <h2 className="font-display text-lg font-bold text-[#10231b]">Quick actions</h2>
            <div className="mt-3 grid gap-2">
              <Link to="/" className="flex items-center justify-between gap-3 rounded-xl border border-[#dfe8e3] px-3.5 py-3 text-sm font-semibold text-[#10231b] hover:border-[#0b7a55] hover:bg-[#eef4f1]">Find medicines <span className="text-xs font-normal text-[#5b6f66]">Search nearby stock</span></Link>
              <Link to="/hospitals" className="flex items-center justify-between gap-3 rounded-xl border border-[#dfe8e3] px-3.5 py-3 text-sm font-semibold text-[#10231b] hover:border-[#0b7a55] hover:bg-[#eef4f1]">Find hospitals <span className="text-xs font-normal text-[#5b6f66]">Departments & doctors</span></Link>
              <button onClick={() => onNavigate("orders")} className="flex items-center justify-between gap-3 rounded-xl border border-[#dfe8e3] px-3.5 py-3 text-left text-sm font-semibold text-[#10231b] hover:border-[#0b7a55] hover:bg-[#eef4f1]">Resend a request <span className="text-xs font-normal text-[#5b6f66]">{needingAction.length} need action</span></button>
              <button onClick={() => onNavigate("profile")} className="flex items-center justify-between gap-3 rounded-xl border border-[#dfe8e3] px-3.5 py-3 text-left text-sm font-semibold text-[#10231b] hover:border-[#0b7a55] hover:bg-[#eef4f1]">Update my details <span className="inline-flex items-center gap-1 text-xs font-normal text-[#5b6f66]">Profile <Settings2 size={13} /></span></button>
            </div>
          </section>
          <section className="rounded-2xl border border-[#dfe8e3] bg-white p-5 shadow-[0_1px_2px_rgba(16,35,27,.04)]">
            <div className="flex items-center gap-2"><MapPin size={17} className="text-[#0b7a55]" /><h2 className="font-display text-lg font-bold text-[#10231b]">Your details</h2></div>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {[["Age", user?.user_metadata?.age ? String(user.user_metadata.age) : "—"], ["Blood", user?.user_metadata?.blood_group || "—"], ["City", user?.user_metadata?.city || "—"]].map(([label, value]) => <div key={label} className="rounded-xl bg-[#eef4f1] px-3 py-2.5"><dt className="text-[10px] font-bold uppercase tracking-[.08em] text-[#5b6f66]">{label}</dt><dd className="mt-1 truncate font-display text-lg font-bold text-[#10231b]">{value}</dd></div>)}
            </dl>
            {lastOrder && <p className="mt-3 truncate text-xs text-[#5b6f66]">Latest pharmacy: {getPharmacyName(lastOrder) || "Not assigned yet"}</p>}
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#dfe8e3] bg-white shadow-[0_1px_2px_rgba(16,35,27,.04)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#e7eee9] px-5 py-4"><div><h2 className="font-display text-lg font-bold text-[#10231b]">Recent orders</h2><p className="mt-1 text-sm text-[#5b6f66]">Latest quotes and order status</p></div><button onClick={() => onNavigate("orders")} className="text-sm font-bold text-[#0b7a55]">View all <ArrowRight className="ml-1 inline" size={14} /></button></div>
        {orders.slice(0, 3).map((order) => <CustomerOrderRow key={order.id} order={order} busy={busyOrder === order.id} onRespond={onRespond} />)}
        {!orders.length && <div className="px-5 py-7 text-center"><Pill className="mx-auto text-[#0b7a55]" size={22} /><p className="mt-2 font-semibold text-[#10231b]">No medicine orders yet</p><p className="mt-1 text-sm text-[#5b6f66]">Send a prescription or find medicine to get started.</p><Link to="/#prescription-upload" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#0b7a55]">Start a prescription request <ArrowRight size={14} /></Link></div>}
        {prescriptions.length > 0 && <button onClick={() => onNavigate("orders")} className="inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-[#0b7a55]"><RotateCw size={14} /> View {prescriptions.length} prescription request{prescriptions.length === 1 ? "" : "s"}</button>}
      </section>
    </div>
  );
}
