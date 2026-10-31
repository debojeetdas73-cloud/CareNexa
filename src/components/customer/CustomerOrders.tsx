import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, Clock3, FileText, MapPin, Pill, RefreshCw, Search, ShoppingBag } from "lucide-react";
import { distanceInKm } from "@/lib/geolocation";
import CustomerOrderRow from "./CustomerOrderRow";
import { getPharmacyName, isOrderComplete, isQuotePending, needsPrescriptionRetry } from "./customerData";
import type { CustomerOrder, PharmacyOption, PrescriptionOrder } from "./types";

type Filter = "all" | "action" | "review" | "done";

const money = (amount: number) => `₹${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (date: string) => new Date(date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function requestOrder(request: PrescriptionOrder, orders: CustomerOrder[]) {
  return request.order_id ? orders.find((order) => order.id === request.order_id) : undefined;
}

function requestNeedsAction(request: PrescriptionOrder) {
  return needsPrescriptionRetry(request);
}

function entryFilter(request: PrescriptionOrder | null, order: CustomerOrder | undefined): Filter {
  if (request && requestNeedsAction(request)) return "action";
  if ((order && isQuotePending(order)) || request?.status === "quoted") return "review";
  if ((order && isOrderComplete(order)) || request?.status === "completed") return "done";
  return "all";
}

function StepTracker({
  labels,
  completed,
  stalled = false,
}: {
  labels: string[];
  completed: number;
  stalled?: boolean;
}) {
  return <ol className="grid grid-cols-5 gap-1.5" aria-label="Order progress">
    {labels.map((label, index) => {
      const done = index < completed;
      const stop = stalled && index === completed;
      return <li key={`${label}-${index}`} className="relative flex min-w-0 flex-col gap-1.5 pr-1 text-[10px] leading-tight sm:text-xs">
        {index < labels.length - 1 && <span aria-hidden="true" className={`absolute left-3 top-[7px] h-0.5 w-[calc(100%-7px)] ${index < completed - 1 ? "bg-[#0b7a55]" : "bg-[#dfe8e3]"}`} />}
        <span className={`relative z-[1] grid h-4 w-4 place-items-center rounded-full border-2 ${stop ? "border-[#d6335a] bg-[#d6335a] text-white" : done ? "border-[#0b7a55] bg-[#0b7a55] text-white" : "border-[#dfe8e3] bg-white text-transparent"}`}>
          {done && <Check size={9} strokeWidth={3} />}
          {stop && <span className="text-[9px] font-bold">!</span>}
        </span>
        <span className={`${stop ? "font-semibold text-[#9b1b34]" : done ? "font-semibold text-[#10231b]" : "text-[#718278]"}`}>{stop ? "No reply" : label}</span>
      </li>;
    })}
  </ol>;
}

function prescriptionProgress(request: PrescriptionOrder, order?: CustomerOrder) {
  const status = request.status.toLowerCase();
  let completed = 1;
  if (["accepted", "quoted", "confirmed", "completed"].includes(status)) completed = 2;
  if (["quoted", "confirmed", "completed"].includes(status) || !!order?.quote_sent_at) completed = 3;
  if (["confirmed", "completed"].includes(status) || !!order?.customer_accepted_quote_at) completed = 4;
  if (status === "completed" || (order && isOrderComplete(order))) completed = 5;
  const stalled = requestNeedsAction(request);
  return { completed, stalled: stalled ? true : undefined };
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "bad" | "wait" | "ok" | "info" }) {
  const tones = {
    neutral: "bg-[#eef4f1] text-[#5b6f66]",
    bad: "bg-[#fde6ea] text-[#9b1b34]",
    wait: "bg-[#fff4d6] text-[#6b4a00]",
    ok: "bg-[#dff3ea] text-[#0b6a49]",
    info: "bg-[#e6edfb] text-[#2b4a9a]",
  };
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{children}</span>;
}

function PrescriptionRequestCard({
  request,
  order,
  pharmacies,
  pharmaciesLoaded,
  busy,
  onRetry,
  onRespond,
}: {
  request: PrescriptionOrder;
  order?: CustomerOrder;
  pharmacies: PharmacyOption[];
  pharmaciesLoaded: boolean;
  busy: boolean;
  onRetry: (requestId: string, pharmacyId?: string) => void;
  onRespond: (orderId: string, accept: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [showPharmacies, setShowPharmacies] = useState(false);
  const retry = requestNeedsAction(request);
  const currentOffers = request.offers.filter((offer) => offer.round_number === request.search_round);
  const assignedOffer = currentOffers.find((offer) => offer.status === "accepted");
  const assignedPharmacy = Array.isArray(assignedOffer?.pharmacies) ? assignedOffer.pharmacies[0] : assignedOffer?.pharmacies;
  const linkedPharmacy = getPharmacyName(order || ({ pharmacies: null } as CustomerOrder));
  const name = assignedPharmacy?.name || linkedPharmacy || `Prescription ${request.id.slice(0, 8)}`;
  const statusTone = retry ? "bad" : request.status === "completed" ? "ok" : request.status === "quoted" || (order ? isQuotePending(order) : false) ? "wait" : request.status === "confirmed" ? "info" : "neutral";
  const statusLabel = retry ? "No pharmacy accepted" : request.status === "searching" ? "Searching nearby" : request.status === "accepted" ? "Pharmacy reviewing" : request.status === "quoted" ? "Quote ready" : request.status === "confirmed" ? "Confirmed" : request.status === "completed" ? "Completed" : request.status.replace(/_/g, " ");
  const distanceChoices = pharmacies.map((pharmacy) => ({
    pharmacy,
    distance: pharmacy.latitude == null || pharmacy.longitude == null
      ? null
      : distanceInKm({ latitude: request.customer_latitude, longitude: request.customer_longitude }, { latitude: pharmacy.latitude, longitude: pharmacy.longitude }),
  })).sort((left, right) => (left.distance ?? Number.MAX_SAFE_INTEGER) - (right.distance ?? Number.MAX_SAFE_INTEGER));
  const matchingPharmacies = distanceChoices.filter(({ pharmacy }) => `${pharmacy.name} ${pharmacy.city} ${pharmacy.district} ${pharmacy.address}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8);
  const labels = ["Sent", "Accepted", "Quote", "Confirm", request.fulfillment_choice === "delivery" ? "Deliver" : "Pickup"];
  const progress = prescriptionProgress(request, order);

  return <article className="flex flex-col gap-3 rounded-2xl border border-[#dfe8e3] bg-white p-3 shadow-[0_1px_2px_rgba(16,35,27,.04)] sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-bold text-[#10231b]">{name}</h3><StatusPill tone={statusTone}>{statusLabel}</StatusPill></div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5b6f66]">
          <span className="inline-flex items-center gap-1"><ShoppingBag size={13}/>{request.fulfillment_choice === "delivery" ? "Home delivery" : "Store pickup"}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays size={13}/>{formatDate(request.created_at)}</span>
          {request.accepted_distance_km != null && <span className="inline-flex items-center gap-1"><MapPin size={13}/>{request.accepted_distance_km} km away</span>}
        </div>
        {request.fulfillment_choice === "delivery" && request.delivery_address && <p className="mt-2 text-sm text-[#5b6f66]">Delivery to: {request.delivery_address}</p>}
      </div>
      {request.status === "searching" && !retry && request.search_expires_at && <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4f1] px-2.5 py-1 text-xs font-semibold text-[#5b6f66]"><Clock3 size={13}/>Until {new Date(request.search_expires_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
    </div>

    <StepTracker labels={labels} completed={progress.completed} stalled={progress.stalled}/>

    {currentOffers.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#eef4f1] p-3">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#5b6f66]">Nearby</span>
      {currentOffers.map((offer) => {
        const pharmacy = Array.isArray(offer.pharmacies) ? offer.pharmacies[0] : offer.pharmacies;
        return <span key={offer.id} className="rounded-full border border-[#dfe8e3] bg-white px-3 py-1 text-xs text-[#345448]">
          {pharmacy?.name || "Pharmacy"}{offer.distance_km != null ? ` · ${offer.distance_km} km` : ""} · {offer.status.replace(/_/g, " ")}
        </span>;
      })}
    </div>}

    {order && isQuotePending(order) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#dff3ea] px-4 py-3 text-[#0b6a49]">
      <p className="min-w-0 flex-1 text-sm"><strong>{order.order_items?.map((item) => {
        const medicine = Array.isArray(item.medicines) ? item.medicines[0] : item.medicines;
        return `${medicine?.name || "Medicine"}${medicine?.strength ? ` ${medicine.strength}` : ""} × ${item.quantity}`;
      }).join(", ") || "The pharmacy prepared your medicine list"}</strong> · final price <strong>{money(Number(order.final_total || 0))}</strong></p>
      <button onClick={() => document.getElementById(`customer-order-${order.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="min-h-9 rounded-full bg-[#0b7a55] px-4 text-xs font-bold text-white hover:bg-[#065c3f]">Review quote</button>
    </div>}

    {retry && <div className="flex flex-col gap-2.5 rounded-xl border border-[#f1d98a] bg-[#fff4d6] p-3 text-[#6b4a00]">
      <div><p className="font-semibold">No pharmacy accepted in time.</p><p className="mt-0.5 text-sm">Try nearby pharmacies again or search for a particular pharmacy.</p></div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => onRetry(request.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#0b7a55] px-4 text-xs font-bold text-white hover:bg-[#065c3f] disabled:opacity-50"><RefreshCw size={13}/>{busy ? "Searching…" : "Search nearby again"}</button>
        <button aria-expanded={showPharmacies} onClick={() => setShowPharmacies((showing) => !showing)} className="min-h-9 rounded-full border border-current px-4 text-xs font-semibold hover:bg-white/50">{showPharmacies ? "Hide pharmacies" : "Choose a pharmacy"}</button>
      </div>
      {showPharmacies && <div className="flex flex-col gap-2">
        <label className="relative block"><Search size={15} className="absolute left-3 top-3 text-[#718278]"/><input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search by name, city, or district" className="h-10 w-full rounded-xl border border-[#f1d98a] bg-white pl-9 pr-3 text-sm text-[#10231b] outline-none focus:border-[#0b7a55]"/></label>
        {!pharmaciesLoaded ? <p className="text-sm">Loading pharmacy details…</p> : matchingPharmacies.length > 0 ? <div className="grid gap-2">
          {matchingPharmacies.map(({ pharmacy, distance }) => <div key={pharmacy.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f1d98a] bg-white px-3.5 py-3 text-[#10231b]">
            <div className="min-w-0"><p className="font-semibold">{pharmacy.name}<span className="ml-1 text-xs font-normal text-[#5b6f66]">· {distance == null ? "distance unavailable" : `${distance.toFixed(1)} km`}</span></p><p className="mt-0.5 text-xs text-[#5b6f66]">{[pharmacy.address, pharmacy.city, pharmacy.district, pharmacy.state].filter(Boolean).join(", ")}</p>{pharmacy.phone && <a href={`tel:${pharmacy.phone}`} className="mt-1 inline-block text-xs font-semibold text-[#0b7a55]">{pharmacy.phone}</a>}</div>
            <button disabled={busy} onClick={() => onRetry(request.id, pharmacy.id)} className="min-h-9 shrink-0 rounded-full border border-[#b5d9c4] px-3.5 text-xs font-bold text-[#0b6a49] hover:bg-[#eef8f2] disabled:opacity-50">Send request</button>
          </div>)}
        </div> : <p className="text-sm">No approved pharmacy matches that search.</p>}
      </div>}
    </div>}
    {request.notes && <p className="text-sm text-[#5b6f66]">Your note: {request.notes}</p>}
  </article>;
}

function MedicineOrderCard({ order }: { order: CustomerOrder }) {
  const quotePending = isQuotePending(order);
  const status = quotePending ? "Quote ready" : order.status.replace(/_/g, " ");
  const tone = quotePending ? "wait" : isOrderComplete(order) ? "ok" : ["cancelled", "rejected"].includes(order.status) ? "bad" : "neutral";
  return <article className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-[#dfe8e3] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,35,27,.04)] sm:px-5">
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-base font-bold text-[#10231b]">{getPharmacyName(order) || `Order ${order.order_number || order.id.slice(0, 8)}`}</h3><StatusPill tone={tone}>{status}</StatusPill></div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5b6f66]"><span>{order.fulfillment_choice || "Fulfillment pending"}</span><span>{formatDate(order.created_at)}</span>{order.order_number && <span>{order.order_number}</span>}</div>
      {quotePending && <p className="mt-1 text-xs text-[#0b6a49]">Review and respond to the quote in medicine order history below.</p>}
    </div>
    <p className="shrink-0 font-display text-base font-bold text-[#10231b]">{order.final_total != null ? money(order.final_total) : "Awaiting quote"}</p>
  </article>;
}

export default function CustomerOrders({
  requests,
  orders,
  pharmacies,
  pharmaciesLoaded,
  busyOrder,
  retrying,
  onRetry,
  onRespond,
}: {
  requests: PrescriptionOrder[];
  orders: CustomerOrder[];
  pharmacies: PharmacyOption[];
  pharmaciesLoaded: boolean;
  busyOrder: string | null;
  retrying: string | null;
  onRetry: (requestId: string, pharmacyId?: string) => void;
  onRespond: (orderId: string, accept: boolean) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const linkedOrders = new Set(requests.map((request) => request.order_id).filter((id): id is string => !!id));
  const standAloneOrders = orders.filter((order) => !order.prescription_order_id || !linkedOrders.has(order.id));
  const entries = useMemo(() => [
    ...requests.map((request) => ({ id: request.id, created_at: request.created_at, request, order: requestOrder(request, orders), filter: entryFilter(request, requestOrder(request, orders)) })),
    ...standAloneOrders.filter((order) => !order.prescription_order_id).map((order) => ({ id: order.id, created_at: order.created_at, order, request: null, filter: entryFilter(null, order) })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [orders, requests, standAloneOrders]);
  const actionCount = entries.filter((entry) => entry.filter === "action").length;
  const reviewCount = entries.filter((entry) => entry.filter === "review").length;
  const completedCount = entries.filter((entry) => entry.filter === "done").length;
  const visibleEntries = filter === "all" ? entries : entries.filter((entry) => entry.filter === filter);
  const filters: Array<{ id: Filter; label: string; count?: number }> = [
    { id: "all", label: "All requests" },
    { id: "action", label: "Needs action", count: actionCount },
    { id: "review", label: "Quote ready", count: reviewCount },
    { id: "done", label: "Completed", count: completedCount },
  ];

  function chooseFilter(next: Filter) {
    setFilter((current) => current === next && next !== "all" ? "all" : next);
  }

  function reviewRequests() {
    setFilter("action");
    window.setTimeout(() => document.getElementById("customer-request-list")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const needsAction = requests.filter(requestNeedsAction).length;

  return <div className="space-y-5">
    <div className="flex justify-end">
      <Link to="/#prescription-upload" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0b7a55] px-4 text-sm font-bold text-white hover:bg-[#065c3f]"><FileText size={15}/>New prescription request</Link>
    </div>

    {needsAction > 0 && <section role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#f1d98a] bg-[#fff4d6] px-4 py-3.5 text-[#6b4a00] sm:px-5">
      <Clock3 className="shrink-0" size={20}/><p className="min-w-0 flex-1 text-sm"><strong className="mr-1">{needsAction} prescription{needsAction === 1 ? " got" : "s got"} no reply.</strong>Nearby pharmacies hold a request for five minutes. Resend it or choose a pharmacy yourself.</p><button onClick={reviewRequests} className="min-h-9 rounded-full border border-current px-3.5 text-xs font-semibold hover:bg-white/50">Review requests</button>
    </section>}

    <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Filter order requests by status">
      {[{ id: "action" as const, label: "Need your action", count: actionCount, tone: "amber" }, { id: "review" as const, label: "Quote to review", count: reviewCount, tone: "blue" }, { id: "done" as const, label: "Completed", count: completedCount, tone: "green" }].map((stat) => <button key={stat.id} aria-pressed={filter === stat.id} onClick={() => chooseFilter(stat.id)} className={`flex items-center justify-between rounded-2xl border bg-white px-4 py-3.5 text-left transition hover:border-[#0b7a55] ${filter === stat.id ? "border-[#0b7a55] ring-1 ring-[#0b7a55]" : "border-[#dfe8e3]"}`}>
        <span className="text-sm text-[#5b6f66]">{stat.label}</span><span className={`font-display text-2xl font-bold ${stat.tone === "amber" ? "text-[#946500]" : stat.tone === "blue" ? "text-[#2b4a9a]" : "text-[#0b6a49]"}`}>{stat.count}</span>
      </button>)}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#eaf1ed] p-1" role="tablist" aria-label="Order request filters">
        {filters.map((option) => <button key={option.id} role="tab" aria-selected={filter === option.id} onClick={() => setFilter(option.id)} className={`min-h-9 whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold transition sm:text-sm ${filter === option.id ? "bg-white text-[#10231b] shadow-sm" : "text-[#5b6f66] hover:text-[#10231b]"}`}>{option.label}{option.count ? <span className="ml-1.5 rounded-full bg-[#dfe8e3] px-1.5 py-0.5 text-[10px]">{option.count}</span> : null}</button>)}
      </div>
      <span className="text-xs font-medium text-[#5b6f66]">Newest first</span>
    </div>

    <section id="customer-request-list" className="scroll-mt-5 space-y-3" aria-live="polite">
      {visibleEntries.map((entry) => entry.request
        ? <PrescriptionRequestCard key={`request-${entry.id}`} request={entry.request} order={entry.order} pharmacies={pharmacies} pharmaciesLoaded={pharmaciesLoaded} busy={retrying === entry.id} onRetry={onRetry} onRespond={onRespond}/>
        : entry.order && <MedicineOrderCard key={`order-${entry.id}`} order={entry.order}/>)}
      {!visibleEntries.length && <div className="rounded-2xl border border-dashed border-[#cbd9d1] bg-white px-5 py-10 text-center"><Pill className="mx-auto text-[#0b7a55]" size={22}/><p className="mt-2 font-semibold text-[#10231b]">No requests in this section</p><p className="mt-1 text-sm text-[#5b6f66]">Choose another filter or send a new request.</p></div>}
    </section>

    <section className="overflow-hidden rounded-2xl border border-[#dfe8e3] bg-white shadow-[0_1px_2px_rgba(16,35,27,.04)]" aria-labelledby="customer-order-history-title">
      <h2 id="customer-order-history-title" className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dfe8e3] px-4 py-4 font-display text-lg font-bold text-[#10231b] sm:px-5">Medicine order history <span className="rounded-full bg-[#eef4f1] px-3 py-1 text-xs font-semibold text-[#5b6f66]">{orders.length} orders</span></h2>
      {orders.length ? orders.map((order) => <CustomerOrderRow key={order.id} order={order} busy={busyOrder === order.id} onRespond={onRespond} scrollId={`customer-order-${order.id}`}/>) : <div className="px-5 py-9 text-center"><ShoppingBag size={23} className="mx-auto text-[#0b7a55]"/><p className="mt-2 font-semibold text-[#10231b]">No medicine orders yet</p><p className="mt-1 text-sm text-[#5b6f66]">Completed and quoted medicine orders will appear here.</p></div>}
    </section>
  </div>;
}
