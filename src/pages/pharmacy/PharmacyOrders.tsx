import { ArrowRight, Bell, CalendarDays } from "lucide-react";
import OrderCard from "@/components/pharmacy/OrderCard";
import OrderMedicineList from "@/components/pharmacy/OrderMedicineList";
import { Empty } from "@/components/pharmacy/DashboardPrimitives";
import PrescriptionOrdersPanel from "@/components/pharmacy/PrescriptionOrdersPanel";
import type { InventoryMedicine, Order, PrescriptionOffer, PrescriptionOrder } from "@/components/pharmacy/types";

type OrderFilter = "all" | "delivery" | "pickup";
type OrderDateFilter = "all" | "today" | "tomorrow" | "yesterday";
type Customer = { key: string; name: string; phone: string; orders: number; spent: number; last: string; days: number; type: string };

const statusOf = (order: Order) => (order.status || "pending").toLowerCase();
const isNew = (order: Order) => ["pending", "requested"].includes(statusOf(order)) && !order.quote_sent_at;
const isAwaitingCustomer = (order: Order) => statusOf(order) === "pending" && !!order.quote_sent_at && !order.customer_accepted_quote_at;
const isDelivery = (order: Order) => /deliver/i.test(order.fulfillment_choice || "");
const isPickup = (order: Order) => /pick/i.test(order.fulfillment_choice || "");

export default function PharmacyOrders({
    prescriptionOrders, prescriptionOffers, orders, inventory, busyOrder, canAcceptRequests,
    claimPrescription, rejectPrescription, releasePrescription, quotePrescription, now, money, clock, offerDeadline,
    orderFilter, setOrderFilter, orderDate, setOrderDate, orderView, setOrderView, refillDue, refillDays, setRefillDays,
    refillLink, shownOrders, onQuote, onOrderStatus, timeAgo,
}: {
    prescriptionOrders: PrescriptionOrder[];
    prescriptionOffers: PrescriptionOffer[];
    orders: Order[];
    inventory: InventoryMedicine[];
    busyOrder: string | null;
    canAcceptRequests: boolean;
    claimPrescription: (id: string) => void;
    rejectPrescription: (id: string, timedOut?: boolean) => void;
    releasePrescription: (id: string) => void;
    quotePrescription: (requestId: string, items: Array<{ medicine_id: string; quantity: number }>, discount: number, message: string) => void;
    now: number;
    money: (value: number) => string;
    clock: (milliseconds: number) => string;
    offerDeadline: (offer: PrescriptionOffer) => number;
    orderFilter: OrderFilter;
    setOrderFilter: (filter: OrderFilter) => void;
    orderDate: OrderDateFilter;
    setOrderDate: (filter: OrderDateFilter) => void;
    orderView: "board" | "list";
    setOrderView: (view: "board" | "list") => void;
    refillDue: Customer[];
    refillDays: number;
    setRefillDays: (days: number) => void;
    refillLink: (customer: { name: string; phone: string }) => string;
    shownOrders: Order[];
    onQuote: (order: Order) => void;
    onOrderStatus: (id: string, status: "processing" | "ready" | "completed" | "cancelled") => void;
    timeAgo: (date: string) => string;
}) {
    return (
                                    <div className="space-y-5">
                                        <PrescriptionOrdersPanel
                                            requests={prescriptionOrders}
                                            offers={prescriptionOffers.filter((offer) => offer.status === "offered")}
                                            orders={orders}
                                            inventory={inventory}
                                            busyId={busyOrder}
                                            canManage={canAcceptRequests}
                                            onClaim={claimPrescription}
                                            onReject={rejectPrescription}
                                            onRelease={releasePrescription}
                                            onQuote={quotePrescription}
                                            now={now}
                                            money={money}
                                            clock={clock}
                                            offerDeadline={offerDeadline}
                                        />
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex flex-wrap gap-2">
                                                {([["all", "All orders", orders.length], ["delivery", "Delivery", orders.filter(isDelivery).length], ["pickup", "Pickup", orders.filter(isPickup).length]] as const).map(([k, label, n]) => (
                                                    <button key={k} onClick={() => setOrderFilter(k)} className={`min-h-[40px] rounded-full px-4 text-sm font-semibold ${orderFilter === k ? "bg-[#0b2f2c] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                                                        {label} <span className="ml-1 font-bold opacity-70">{n}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                                                    <CalendarDays size={16} />
                                                    <select value={orderDate} onChange={(e) => setOrderDate(e.target.value as typeof orderDate)} aria-label="Filter orders by date" className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-500">
                                                        <option value="all">All dates</option>
                                                        <option value="today">Today</option>
                                                        <option value="tomorrow">Tomorrow</option>
                                                        <option value="yesterday">Yesterday</option>
                                                    </select>
                                                </label>
                                                <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
                                                    {(["board", "list"] as const).map((v) => (
                                                        <button key={v} onClick={() => setOrderView(v)} className={`min-h-[38px] rounded-lg px-4 text-xs font-bold capitalize ${orderView === v ? "bg-[#0b2f2c] text-white" : "text-slate-500"}`}>{v}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {refillDue.length > 0 && (
                                            <div className="rounded-3xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Bell size={18} className="text-violet-700" /> Refill reminders</h2>
                                                        <p className="mt-1 text-sm text-slate-500">Customers whose last order was {refillDays}+ days ago. Send a nudge to bring them back.</p>
                                                    </div>
                                                    <select value={refillDays} onChange={(e) => setRefillDays(Number(e.target.value))} aria-label="Remind after" className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                                                        {[15, 25, 30, 45].map((d) => <option key={d} value={d}>After {d} days</option>)}
                                                    </select>
                                                </div>
                                                <div className="mt-3 divide-y divide-violet-100 rounded-xl bg-white">
                                                    {refillDue.slice(0, 6).map((c) => (
                                                        <div key={c.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-bold">{c.name}</p>
                                                                <p className="text-xs text-slate-500">{c.phone} · last order {c.days} days ago · {c.orders} order{c.orders === 1 ? "" : "s"}</p>
                                                            </div>
                                                            <a href={refillLink(c)} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700">
                                                                <Bell size={14} /> Send reminder
                                                            </a>
                                                        </div>
                                                    ))}
                                                </div>
                                                {refillDue.length > 6 && <p className="mt-2 text-xs text-slate-500">+ {refillDue.length - 6} more in the Customers tab</p>}
                                            </div>
                                        )}

                                        {orders.length === 0 ? (
                                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><Empty title="No customer requests" detail="When a customer places an order, it will appear here." /></div>
                                        ) : orderView === "list" ? (
                                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                                                <div className="divide-y divide-slate-100">{shownOrders.map((o) => <OrderCard key={o.id} order={o} busy={busyOrder === o.id} canManage={canAcceptRequests} money={money} onQuote={onQuote} onStatus={onOrderStatus} />)}</div>
                                            </div>
                                        ) : (
                                            <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-5">
                                                {([
                                                    ["New", (o: Order) => isNew(o), "bg-rose-50", "text-rose-700"],
                                                    ["Awaiting customer", isAwaitingCustomer, "bg-violet-50", "text-violet-800"],
                                                    ["Accepted", (o: Order) => statusOf(o) === "confirmed", "bg-amber-50", "text-amber-800"],
                                                    ["Packing", (o: Order) => statusOf(o) === "processing", "bg-blue-50", "text-blue-700"],
                                                    ["Ready / completed", (o: Order) => ["ready", "completed"].includes(statusOf(o)), "bg-emerald-50", "text-emerald-800"],
                                                ] as const).map(([label, match, bg, fg]) => {
                                                    const items = shownOrders.filter(match);
                                                    return (
                                                        <section key={label} className={`rounded-2xl ${bg} p-3`}>
                                                            <div className="flex items-center justify-between px-1 py-1">
                                                                <h3 className={`text-sm font-extrabold ${fg}`}>{label}</h3>
                                                                <span className={`rounded-full bg-white px-2.5 py-0.5 text-xs font-bold ${fg}`}>{items.length}</span>
                                                            </div>
                                                            <div className="mt-2 space-y-3">
                                                                {items.slice(0, 20).map((o) => (
                                                                    <article key={o.id} className="rounded-xl border border-white bg-white p-4 shadow-sm">
                                                                        <div className="flex items-start justify-between gap-2">
                                                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                                                <p className="truncate text-sm font-extrabold">{o.order_number || `Order ${o.id.slice(0, 8)}`}</p>
                                                                                {o.prescription_order_id && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">Prescription</span>}
                                                                            </div>
                                                                            <b className="shrink-0 text-sm">{o.final_total != null ? money(o.final_total) : "Awaiting quote"}</b>
                                                                        </div>
                                                                        <p className="mt-1 text-sm font-semibold">{o.customer_name}</p>
                                                                        <p className="text-xs text-slate-500">{o.customer_phone}</p>
                                                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                                                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">{o.fulfillment_choice || "Fulfillment pending"}</span>
                                                                            <span className="text-slate-400">{timeAgo(o.created_at)}</span>
                                                                        </div>
                                                                        <div className="mt-3">
                                                                            <OrderMedicineList items={o.items} money={money} compact />
                                                                        </div>
                                                                        {label === "New" && (
                                                                            <div className="mt-3 flex gap-2">
                                                                                <button disabled={busyOrder === o.id || !canAcceptRequests} onClick={() => onQuote(o)} className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Review & quote</button>
                                                                                <button disabled={busyOrder === o.id} onClick={() => onOrderStatus(o.id, "cancelled")} className="min-h-[44px] flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Decline</button>
                                                                            </div>
                                                                        )}
                                                                        {label === "Awaiting customer" && <p className="mt-3 rounded-lg bg-violet-50 p-2 text-xs font-semibold text-violet-800">Quote sent. Waiting for the customer to accept or decline.</p>}
                                                                        {label === "Accepted" && (
                                                                            <button disabled={busyOrder === o.id} onClick={() => onOrderStatus(o.id, "processing")} className="mt-3 min-h-[44px] w-full rounded-xl bg-[#0b2f2c] text-sm font-bold text-white disabled:opacity-50">Start packing</button>
                                                                        )}
                                                                        {label === "Packing" && (
                                                                            <div className="mt-3 flex gap-2">
                                                                                <button disabled={busyOrder === o.id} onClick={() => onOrderStatus(o.id, "ready")} className="min-h-[44px] flex-1 rounded-xl border border-emerald-200 bg-white text-sm font-bold text-emerald-800 disabled:opacity-50">Mark ready</button>
                                                                                <button disabled={busyOrder === o.id} onClick={() => onOrderStatus(o.id, "completed")} className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Complete</button>
                                                                            </div>
                                                                        )}
                                                                        {label === "Ready / completed" && statusOf(o) === "ready" && <button disabled={busyOrder === o.id} onClick={() => onOrderStatus(o.id, "completed")} className="mt-3 min-h-[44px] w-full rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">Mark completed</button>}
                                                                    </article>
                                                                ))}
                                                                {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Nothing here</p>}
                                                            </div>
                                                        </section>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    );
}
