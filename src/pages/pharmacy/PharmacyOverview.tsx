import type { Dispatch, SetStateAction } from "react";
import { ArrowRight, Bell, Boxes, CircleAlert, Clock3, FileText, Users, Wallet, Warehouse } from "lucide-react";
import OrderMedicineList from "@/components/pharmacy/OrderMedicineList";
import { Empty, Metric } from "@/components/pharmacy/DashboardPrimitives";
import { DutyPanel } from "@/components/pharmacy/PharmacyDutyPanel";
import type { InventoryMedicine, Order, PharmacyRecord, PrescriptionOffer } from "@/components/pharmacy/types";

type Tab = "overview" | "inventory" | "distributors" | "orders" | "customers" | "earnings" | "profile";
type Customer = { key: string; name: string; orders: number };
const statusOf = (order: Order) => (order.status || "pending").toLowerCase();
type Earnings = {
    today: number;
    todayCount: number;
    delta: number | null;
    month: number;
    series: (days: number) => Array<{ date: Date; total: number; count: number }>;
};

export default function PharmacyOverview({
    pharmacy, verified, dutyBusy, setPharmacyDuty, notificationSound, togglePrescriptionSound, primeAudio, playRing,
    pending, offeredPrescriptionCount, activePrescriptionCount, earnings, offeredOffers, now, busyOrder, canAcceptRequests,
    claimPrescription, rejectPrescription, go, setQuoteOrder, setQuoteDiscount, setQuoteMessage, setOrderStatus,
    inventory, units, low, expiring, awaitingCustomer, orders, inProgress, customers, repeatPct, money, timeAgo,
}: {
    pharmacy: PharmacyRecord;
    verified: boolean;
    dutyBusy: boolean;
    setPharmacyDuty: (onDuty: boolean) => void;
    notificationSound: boolean;
    togglePrescriptionSound: () => void;
    primeAudio: () => boolean;
    playRing: (force?: boolean) => void;
    pending: Order[];
    offeredPrescriptionCount: number;
    activePrescriptionCount: number;
    earnings: Earnings;
    offeredOffers: PrescriptionOffer[];
    now: number;
    busyOrder: string | null;
    canAcceptRequests: boolean;
    claimPrescription: (id: string) => void;
    rejectPrescription: (id: string, timedOut?: boolean) => void;
    go: (tab: Tab) => void;
    setQuoteOrder: Dispatch<SetStateAction<Order | null>>;
    setQuoteDiscount: Dispatch<SetStateAction<string>>;
    setQuoteMessage: Dispatch<SetStateAction<string>>;
    setOrderStatus: (id: string, status: "processing" | "ready" | "completed" | "cancelled") => void;
    inventory: InventoryMedicine[];
    units: number;
    low: InventoryMedicine[];
    expiring: InventoryMedicine[];
    awaitingCustomer: Order[];
    orders: Order[];
    inProgress: Order[];
    customers: Customer[];
    repeatPct: number;
    money: (amount: number) => string;
    timeAgo: (date: string) => string;
}) {
    const sparkPath = (values: number[], width = 600, height = 80) => {
        if (values.length < 2) return { line: "", area: "", end: null as readonly [number, number] | null };
        const max = Math.max(1, ...values);
        const points = values.map((value, index) => [(index / (values.length - 1)) * width, height - 8 - (value / max) * (height - 16)] as const);
        const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
        return { line, area: `${line} L${width} ${height} L0 ${height} Z`, end: points[points.length - 1] as readonly [number, number] | null };
    };

    return (
                                    <div className="space-y-5">
                                        <DutyPanel
                                            pharmacy={pharmacy}
                                            verified={verified}
                                            active={pharmacy.is_active === true}
                                            dutyBusy={dutyBusy}
                                            onToggleDuty={() => void setPharmacyDuty(!pharmacy.is_active)}
                                            soundOn={notificationSound}
                                            onToggleSound={togglePrescriptionSound}
                                            onTestRing={() => { if (primeAudio()) playRing(true); }}
                                            newOrders={pending.length}
                                            rxWaiting={offeredPrescriptionCount}
                                            rxReview={activePrescriptionCount}
                                            doneToday={earnings.todayCount}
                                            offers={offeredOffers}
                                            now={now}
                                            busyId={busyOrder}
                                            canManage={canAcceptRequests}
                                            onClaim={claimPrescription}
                                            onReject={rejectPrescription}
                                            onOpenOrders={() => go("orders")}
                                            onOpenProfile={() => go("profile")}
                                        />

                                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
                                            {/* earnings hero */}
                                            <div className="flex flex-col justify-between gap-4 rounded-3xl bg-[#0b2f2c] p-6 text-white md:p-7">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Today’s earnings</p>
                                                        <p className="mt-2 text-5xl font-extrabold leading-none tracking-tight">{money(earnings.today)}</p>
                                                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                                                            {earnings.delta !== null ? (
                                                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${earnings.delta >= 0 ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/20 text-rose-200"}`}>
                                                                    {earnings.delta >= 0 ? "▲" : "▼"} {Math.abs(earnings.delta).toFixed(1)}% vs yesterday
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-slate-400">No sales yesterday to compare</span>
                                                            )}
                                                            <span className="text-slate-400">{earnings.todayCount} completed today</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => go("earnings")} className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-white/10 px-4 text-sm font-bold hover:bg-white/20">
                                                        View earnings <ArrowRight size={15} />
                                                    </button>
                                                </div>
                                                {(() => {
                                                    const series = earnings.series(14);
                                                    const path = sparkPath(series.map((d) => d.total));
                                                    return (
                                                        <div>
                                                            <svg viewBox="0 0 600 80" className="w-full overflow-visible" role="img" aria-label="Sales trend for the last 14 days">
                                                                {[8, 40, 72].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#fff" strokeOpacity={0.08} />)}
                                                                <path d={path.area} fill="#2dd4a8" fillOpacity={0.15} />
                                                                <path d={path.line} fill="none" stroke="#2dd4a8" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                                                                {path.end && <circle cx={path.end[0]} cy={path.end[1]} r={5} fill="#2dd4a8" />}
                                                            </svg>
                                                            <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                                                                <span>{series[0].date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                                                                <span>Today</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                                <p className="text-xs text-slate-400">Based on completed orders with a final price. This is sales value, not net profit.</p>
                                            </div>

                                            {/* new requests */}
                                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <h2 className="text-base font-extrabold">New order requests</h2>
                                                    {pending.length > 0 && <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">{pending.length} waiting</span>}
                                                </div>
                                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-violet-700"><FileText size={18} /></span>
                                                        <div>
                                                            <p className="text-sm font-extrabold">Prescription queue</p>
                                                            <p className="mt-1 text-xs text-slate-600">{offeredPrescriptionCount} nearby waiting · {activePrescriptionCount} accepted for review</p>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => go("orders")} className="min-h-10 rounded-lg bg-white px-3 text-xs font-bold text-violet-800 shadow-sm hover:bg-violet-100">Open queue <ArrowRight className="ml-1 inline" size={13} /></button>
                                                </div>
                                                <div className="mt-4 space-y-3">
                                                    {pending.length === 0 && <Empty title="No new requests" detail="New customer requests will appear here." />}
                                                    {pending.slice(0, 2).map((o) => (
                                                        <div key={o.id} className="rounded-2xl border border-slate-200 p-4">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-extrabold">{o.order_number || `Order ${o.id.slice(0, 8)}`} · {o.customer_name}</p>
                                                                    <p className="mt-1 text-xs text-slate-500">{o.fulfillment_choice || "Fulfillment pending"} · {timeAgo(o.created_at)}</p>
                                                                </div>
                                                                <b className="text-sm">{o.final_total != null ? money(o.final_total) : "Quote"}</b>
                                                            </div>
                                                            <div className="mt-3 flex gap-2">
                                                                <button disabled={busyOrder === o.id || !canAcceptRequests} onClick={() => { setQuoteOrder(o); setQuoteDiscount("0"); setQuoteMessage(""); }} className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Review & quote</button>
                                                                <button disabled={busyOrder === o.id} onClick={() => setOrderStatus(o.id, "cancelled")} className="min-h-[44px] flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Decline</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button onClick={() => go("orders")} className="mt-4 text-sm font-bold text-emerald-700">See all orders <ArrowRight className="ml-1 inline" size={14} /></button>
                                            </div>
                                        </div>

                                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                            <Metric icon={<Boxes size={20} />} label="Medicine types" value={inventory.length} hint="Tracked in inventory" tone="green" />
                                            <Metric icon={<Warehouse size={20} />} label="Units in stock" value={units.toLocaleString("en-IN")} hint="Across all medicine items" tone="blue" />
                                            <Metric icon={<CircleAlert size={20} />} label="Low stock alerts" value={low.length} hint={low.length ? "Needs attention" : "Stock levels look good"} tone={low.length ? "amber" : "green"} />
                                            <Metric icon={<Clock3 size={20} />} label="Expiring in 60 days" value={expiring.length} hint={expiring.length ? "Sell, discount or return" : "Nothing expiring soon"} tone={expiring.length ? "rose" : "green"} />
                                        </div>

                                        <div>
                                            <h2 className="mb-3 text-base font-extrabold">Worklist right now</h2>
                                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                                {([
                                                    ["Awaiting customer", awaitingCustomer.length, "text-violet-800"],
                                                    ["Accepted, to pack", orders.filter((o) => ["confirmed", "processing"].includes(statusOf(o))).length, "text-amber-800"],
                                                    ["Ready for handover", orders.filter((o) => statusOf(o) === "ready").length, "text-emerald-800"],
                                                    ["In progress, all", inProgress.length, "text-slate-800"],
                                                ] as const).map(([label, n, color]) => (
                                                    <button key={label} onClick={() => go("orders")} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md">
                                                        <span className={`block text-3xl font-extrabold tabular-nums ${color}`}>{n}</span>
                                                        <span className="mt-1 block text-sm text-slate-500">{label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {([
                                                    ["Inventory", `${low.length} low · ${expiring.length} expiring`, () => go("inventory"), Boxes],
                                                    ["Customers", `${customers.length} customer${customers.length === 1 ? "" : "s"} · ${repeatPct}% repeat`, () => go("customers"), Users],
                                                    ["Earnings", `${money(earnings.month)} in 30 days`, () => go("earnings"), Wallet],
                                                ] as const).map(([label, detail, onClick, Icon]) => (
                                                    <button key={label} onClick={onClick} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-emerald-300">
                                                        <Icon size={16} className="text-emerald-700" /> {label} <span className="font-normal text-slate-400">· {detail}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    );
}
