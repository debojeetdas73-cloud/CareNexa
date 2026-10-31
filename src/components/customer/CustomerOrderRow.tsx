import { CalendarDays, Pill } from "lucide-react";
import { getPharmacyName, isQuotePending } from "./customerData";
import type { CustomerOrder } from "./types";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  confirmed: "bg-blue-50 text-blue-800",
  processing: "bg-violet-50 text-violet-800",
  ready: "bg-emerald-50 text-emerald-800",
  completed: "bg-emerald-50 text-emerald-800",
  delivered: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-rose-50 text-rose-800",
  rejected: "bg-rose-50 text-rose-800",
};

const money = (amount: number) => `₹${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function CustomerOrderRow({
  order,
  busy,
  onRespond,
  scrollId,
}: {
  order: CustomerOrder;
  busy: boolean;
  onRespond: (orderId: string, accept: boolean) => void;
  scrollId?: string;
}) {
  const status = (order.status || "pending").toLowerCase();
  const quotePending = isQuotePending(order);

  return (
    <article id={scrollId} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-[#e7eee9] px-4 py-3 last:border-0 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5">
      <span className="row-span-2 grid h-10 w-10 place-items-center rounded-xl bg-[#dff3ea] text-[#0b6a49]">
        <Pill size={19} />
      </span>
      <div className="min-w-0">
        <p className="break-words font-bold text-[#10231b]">{order.order_number || `Order ${order.id.slice(0, 8)}`}</p>
        <p className="mt-1 truncate text-sm text-[#5b6f66]">
          {getPharmacyName(order) || "Pharmacy"} · {order.fulfillment_choice || "Fulfillment pending"}
          {order.prescription_order_id && <span className="ml-1 text-[#2b4a9a]">· Prescription</span>}
        </p>
        <p className="mt-1 text-xs text-[#718278]">
          <CalendarDays size={12} className="mr-1 inline" />
          {new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>
      <div className="col-start-3 row-start-1 text-right">
        <p className="font-display text-lg font-bold text-[#10231b]">
          {order.final_total != null ? money(order.final_total) : "Awaiting quote"}
        </p>
        <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${quotePending ? "bg-amber-50 text-amber-800" : statusStyles[status] || "bg-slate-100 text-slate-700"}`}>
          {quotePending ? "Quote to review" : status.replace(/_/g, " ")}
        </span>
        {Number(order.discount_amount || 0) > 0 && <p className="mt-1 text-xs font-semibold text-[#0b6a49]">{money(order.discount_amount!)} discount</p>}
      </div>

      {!!order.order_items?.length && (
        <div className="col-span-3 col-start-1 sm:col-span-2 sm:col-start-2">
          <div className="rounded-xl bg-[#eef4f1] px-3 py-2 text-sm">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[.08em] text-[#5b6f66]">Requested medicines</span>
            <ul className="space-y-1">
              {order.order_items.map((item, index) => {
                const medicine = Array.isArray(item.medicines) ? item.medicines[0] : item.medicines;
                return (
                  <li key={`${order.id}-${index}`} className="flex justify-between gap-3">
                    <span>{medicine?.name || "Medicine"}{medicine?.strength && !medicine.name?.toLocaleLowerCase().includes(medicine.strength.toLocaleLowerCase()) ? ` ${medicine.strength}` : ""} × {item.quantity}</span>
                  </li>
                );
              })}
            </ul>
            {order.final_total == null && <p className="mt-2 text-xs text-[#5b6f66]">The pharmacy will send its price after reviewing this request.</p>}
          </div>
        </div>
      )}

      {quotePending && (
        <div className="col-span-3 rounded-xl border border-[#cde8d9] bg-[#f0faf4] p-3 sm:col-span-2 sm:col-start-2">
          <p className="text-sm font-semibold text-[#174d37]">The pharmacy sent a final quote. Review the medicine list and price.</p>
          {order.quote_message && <p className="mt-1 text-sm text-[#426451]">{order.quote_message}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => onRespond(order.id, true)} className="min-h-10 rounded-full bg-[#0b7a55] px-4 text-sm font-bold text-white hover:bg-[#065c3f] disabled:opacity-50">
              {busy ? "Saving…" : "Accept quote"}
            </button>
            <button disabled={busy} onClick={() => onRespond(order.id, false)} className="min-h-10 rounded-full border border-[#dfe8e3] bg-white px-4 text-sm font-bold text-[#5b6f66] hover:border-rose-300 hover:text-rose-700 disabled:opacity-50">
              Decline quote
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
