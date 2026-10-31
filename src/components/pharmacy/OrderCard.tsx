import { CalendarDays, ShoppingBag } from "lucide-react";
import OrderMedicineList from "./OrderMedicineList";
import type { Order } from "./types";

const statusOf = (order: Order) => (order.status || "pending").toLowerCase();
const isNew = (order: Order) => ["pending", "requested"].includes(statusOf(order)) && !order.quote_sent_at;
const isAwaitingCustomer = (order: Order) => statusOf(order) === "pending" && !!order.quote_sent_at && !order.customer_accepted_quote_at;

export default function OrderCard({
    order,
    busy,
    canManage,
    money,
    onQuote,
    onStatus,
}: {
    order: Order;
    busy: boolean;
    canManage: boolean;
    money: (value: number) => string;
    onQuote: (order: Order) => void;
    onStatus: (id: string, status: "processing" | "ready" | "completed" | "cancelled") => void;
}) {
    const status = statusOf(order);
    const colors: Record<string, string> = {
        pending: "bg-amber-50 text-amber-800",
        confirmed: "bg-blue-50 text-blue-800",
        processing: "bg-violet-50 text-violet-800",
        ready: "bg-emerald-50 text-emerald-800",
        completed: "bg-emerald-50 text-emerald-800",
        cancelled: "bg-rose-50 text-rose-800",
        rejected: "bg-rose-50 text-rose-800",
    };

    return (
        <article className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><ShoppingBag size={19} /></span>
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 truncate font-extrabold">
                        {order.order_number || `Order ${order.id.slice(0, 8)}`}
                        {order.prescription_order_id && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">Prescription</span>}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{order.customer_name} · {order.customer_phone}</p>
                    <p className="mt-1 text-xs text-slate-400"><CalendarDays className="mr-1 inline" size={12} />{new Date(order.created_at).toLocaleString()} · {order.fulfillment_choice || "Fulfillment pending"}</p>
                </div>
            </div>
            <div className="text-right">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors[status] || "bg-slate-100 text-slate-600"}`}>{isAwaitingCustomer(order) ? "awaiting customer" : status.replace(/_/g, " ")}</span>
                <p className="mt-2 text-sm font-extrabold">{order.final_total != null ? money(order.final_total) : "Awaiting quote"}</p>
            </div>
            <div className="w-full">
                <OrderMedicineList items={order.items} money={money} compact />
            </div>
            {isNew(order) && (
                <div className="flex w-full gap-2">
                    <button disabled={busy || !canManage} onClick={() => onQuote(order)} className="min-h-[40px] flex-1 rounded-lg bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">Review &amp; quote</button>
                    <button disabled={busy} onClick={() => onStatus(order.id, "cancelled")} className="min-h-[40px] flex-1 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 disabled:opacity-50">Decline</button>
                </div>
            )}
            {status === "confirmed" && <button disabled={busy} onClick={() => onStatus(order.id, "processing")} className="min-h-[40px] w-full rounded-lg bg-[#0b2f2c] text-sm font-bold text-white disabled:opacity-50">Start packing</button>}
            {status === "processing" && <div className="flex w-full gap-2"><button disabled={busy} onClick={() => onStatus(order.id, "ready")} className="min-h-[40px] flex-1 rounded-lg border border-emerald-200 text-sm font-bold text-emerald-800 disabled:opacity-50">Mark ready</button><button disabled={busy} onClick={() => onStatus(order.id, "completed")} className="min-h-[40px] flex-1 rounded-lg bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">Complete</button></div>}
            {status === "ready" && <button disabled={busy} onClick={() => onStatus(order.id, "completed")} className="min-h-[40px] w-full rounded-lg bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">Mark completed</button>}
        </article>
    );
}
