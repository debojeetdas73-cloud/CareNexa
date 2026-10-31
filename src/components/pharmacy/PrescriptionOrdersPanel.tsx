import { FileText, MapPin, Phone, Plus, X } from "lucide-react";
import { useState } from "react";
import type { InventoryMedicine as Inv, Order, PrescriptionOffer, PrescriptionOrder } from "./types";
export default function PrescriptionOrdersPanel({
    requests,
    offers,
    orders,
    inventory,
    busyId,
    canManage,
    onClaim,
    onReject,
    onRelease,
    onQuote,
    now,
    money,
    clock,
    offerDeadline,
}: {
    now: number;
    requests: PrescriptionOrder[];
    offers: PrescriptionOffer[];
    orders: Order[];
    inventory: Inv[];
    busyId: string | null;
    canManage: boolean;
    onClaim: (id: string) => void;
    onReject: (id: string) => void;
    onRelease: (id: string) => void;
    onQuote: (requestId: string, items: Array<{ medicine_id: string; quantity: number }>, discount: number, message: string) => void;
    money: (value: number) => string;
    clock: (milliseconds: number) => string;
    offerDeadline: (offer: PrescriptionOffer) => number;
}) {
    const reviewRequests = requests.filter((request) => request.status === "accepted");
    const quotedRequests = requests.filter((request) => request.status !== "accepted");
    return (
        <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileText size={20} /></span>
                    <div><h2 className="text-lg font-extrabold">Prescription counter</h2><p className="mt-1 text-sm text-slate-500">Accept nearby requests to review the prescription and prepare a medicine quote.</p></div>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{offers.length} waiting · {reviewRequests.length} to review</span>
            </div>
            {offers.length > 0 && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <h3 className="font-bold text-amber-950">Nearby requests</h3>
                <p className="mt-1 text-xs text-amber-900/70">Customer and prescription details stay private until your pharmacy accepts.</p>
                <div className="mt-2 divide-y divide-amber-100 rounded-xl bg-white">
                    {offers.map((offer) => <article key={offer.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div>
                            <p className="font-semibold">{offer.fulfillment_choice === "delivery" ? "Delivery" : "Pickup"} request</p>
                            <p className="mt-0.5 text-xs text-slate-500">{offer.distance_km !== null ? `${offer.distance_km} km away` : "Distance unavailable"} · <b className="tabular-nums text-emerald-700">{clock(offerDeadline(offer) - now)} left</b></p>
                        </div>
                        <div className="flex w-full gap-2 sm:w-auto">
                            <button disabled={!canManage || busyId === offer.id || offerDeadline(offer) <= now} onClick={() => onClaim(offer.id)} className="min-h-[40px] flex-1 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busyId === offer.id ? "Opening…" : "Accept & review"}</button>
                            <button disabled={!canManage || busyId === offer.id} onClick={() => onReject(offer.id)} className="min-h-[40px] rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:opacity-50">Pass</button>
                        </div>
                    </article>)}
                </div>
            </div>}
            {reviewRequests.length > 0 && <div className="mt-4 space-y-4">
                {reviewRequests.map((request) => <article key={request.id} className="rounded-2xl border border-emerald-100 bg-[#fbfefd] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><p className="text-lg font-extrabold">{request.customer_name}</p><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">accepted · {request.fulfillment_choice}</span></div>
                            <p className="mt-1 text-sm text-slate-600"><Phone size={14} className="mr-1 inline" />{request.customer_phone}</p>
                            <p className="mt-1 text-xs text-slate-500">{request.fulfillment_choice === "delivery" ? `Delivery · ${request.accepted_distance_km ?? "—"} km away` : "Store pickup"} · received {new Date(request.created_at).toLocaleString("en-IN")}</p>
                            {request.fulfillment_choice === "delivery" && request.delivery_address && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><MapPin size={14} className="mr-1 inline" />{request.delivery_address}</p>}
                            {request.notes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{request.notes}</p>}
                        </div>
                        <button disabled={!canManage || busyId === request.id} onClick={() => onRelease(request.id)} className="min-h-[40px] rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 disabled:opacity-50">Not available · pass to next pharmacy</button>
                    </div>
                    {request.signed_url ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-2"><img src={request.signed_url} alt={`Prescription from ${request.customer_name}`} className="mx-auto max-h-[540px] max-w-full rounded-lg object-contain" /></div> : <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Prescription image could not be opened. Refresh the dashboard and try again.</p>}
                    <PrescriptionQuoteEditor requestId={request.id} inventory={inventory} busy={busyId === request.id} canManage={canManage} money={money} onQuote={onQuote} onRelease={onRelease} />
                </article>)}
            </div>}
            {quotedRequests.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div><h3 className="font-extrabold">Prescription orders</h3><p className="mt-1 text-xs text-slate-500">Sent quotes and later order updates stay listed here.</p></div>
                    <span className="text-xs font-bold text-slate-500">{quotedRequests.length} order{quotedRequests.length === 1 ? "" : "s"}</span>
                </div>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                    {quotedRequests.map((request) => {
                        const order = orders.find((candidate) => candidate.prescription_order_id === request.id);
                        return <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><FileText size={17} /></span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold">{request.customer_name} <span className="font-medium text-slate-400">· {order?.order_number || (order ? `Order ${order.id.slice(0, 8)}` : "Prescription")}</span></p>
                                    <p className="mt-1 text-xs capitalize text-slate-500">{request.fulfillment_choice} · {order?.status || request.status.replace(/_/g, " ")}</p>
                                </div>
                            </div>
                            {order && <span className="text-sm font-extrabold">{order.final_total != null ? money(order.final_total) : "Awaiting customer"}</span>}
                        </article>;
                    })}
                </div>
            </div>}
            {!offers.length && !reviewRequests.length && !quotedRequests.length && <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Nearby prescription requests appear here when customers send them to pharmacies in your area. Enable sound alerts at the top of the portal to hear incoming requests.</p>}
        </section>
    );
}

function PrescriptionQuoteEditor({
    requestId,
    inventory,
    busy,
    canManage,
    onQuote,
    onRelease,
    money,
}: {
    requestId: string;
    inventory: Inv[];
    busy: boolean;
    canManage: boolean;
    money: (value: number) => string;
    onQuote: (requestId: string, items: Array<{ medicine_id: string; quantity: number }>, discount: number, message: string) => void;
    onRelease: (requestId: string) => void;
}) {
    const [search, setSearch] = useState("");
    const [medicineId, setMedicineId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [items, setItems] = useState<Array<{ medicine_id: string; quantity: number }>>([]);
    const [discount, setDiscount] = useState("0");
    const [message, setMessage] = useState("");
    const matches = inventory
        .filter((row) => `${row.medicine_name} ${row.generic_name || ""} ${row.brand_name || ""} ${row.strength || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => Number(Number(b.quantity_on_hand) > 0) - Number(Number(a.quantity_on_hand) > 0))
        .slice(0, 8);
    const inStockMatches = matches.filter((row) => Number(row.quantity_on_hand) > 0);
    const selected = items.map((line) => ({ line, medicine: inventory.find((row) => row.medicine_id === line.medicine_id) })).filter((item): item is { line: { medicine_id: string; quantity: number }; medicine: Inv } => !!item.medicine);
    const subtotal = selected.reduce((sum, item) => sum + Number(item.medicine.selling_price || 0) * item.line.quantity, 0);
    const discountAmount = Number(discount);

    function addMedicine() {
        if (!medicineId) return;
        const availableQuantity = Number(inventory.find((row) => row.medicine_id === medicineId)?.quantity_on_hand || 1);
        const requestedQuantity = Math.min(availableQuantity, Math.max(1, quantity));
        setItems((current) => {
            const existing = current.find((item) => item.medicine_id === medicineId);
            return existing
                ? current.map((item) => item.medicine_id === medicineId ? { ...item, quantity: Math.min(availableQuantity, item.quantity + requestedQuantity) } : item)
                : [...current, { medicine_id: medicineId, quantity: requestedQuantity }];
        });
        setMedicineId("");
        setSearch("");
        setQuantity(1);
    }

    return <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <h3 className="font-extrabold">Check stock and prepare the quote</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_auto]">
            <div>
                <label className="sr-only" htmlFor={`rx-search-${requestId}`}>Search medicines</label>
                <input id={`rx-search-${requestId}`} value={search} onChange={(event) => { setSearch(event.target.value); setMedicineId(""); }} placeholder="Search your stocked medicines" className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
                {search && !medicineId && matches.length > 0 && <div className="mt-1 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white">{matches.map((row) => Number(row.quantity_on_hand) > 0
                    ? <button key={row.medicine_id} type="button" onClick={() => { setMedicineId(row.medicine_id); setSearch(row.medicine_name); }} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50"><span>{row.medicine_name} {row.strength || ""}</span><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">{row.quantity_on_hand} in stock · {money(row.selling_price)}</span></button>
                    : <div key={row.medicine_id} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-400"><span>{row.medicine_name} {row.strength || ""}</span><span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">Out of stock</span></div>)}</div>}
                {search.trim() && !medicineId && inStockMatches.length === 0 && (
                    <div className="mt-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="status">
                        <p className="font-bold">{matches.length ? "Out of stock" : "Not in your stock"}</p>
                        <p className="mt-1 text-xs">If you cannot supply this medicine, pass the request on. The next nearby pharmacy is asked straight away and the customer is told.</p>
                        <button type="button" disabled={!canManage || busy} onClick={() => onRelease(requestId)} className="mt-2 min-h-[40px] rounded-lg bg-rose-600 px-3 text-sm font-bold text-white disabled:opacity-50">Not available · pass to next pharmacy</button>
                    </div>
                )}
            </div>
            <label className="sr-only" htmlFor={`rx-qty-${requestId}`}>Quantity</label><input id={`rx-qty-${requestId}`} type="number" min="1" max={Math.max(1, Number(inventory.find((row) => row.medicine_id === medicineId)?.quantity_on_hand || 1))} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm" />
            <button type="button" disabled={!canManage || !medicineId || busy} onClick={addMedicine} className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-emerald-800 disabled:opacity-50"><Plus size={15} /> Add medicine</button>
        </div>
        {selected.length > 0 && <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">{selected.map(({ line, medicine }) => <div key={line.medicine_id} className="flex flex-wrap items-center justify-between gap-2 p-3"><div><p className="text-sm font-semibold">{medicine.medicine_name} {medicine.strength || ""}</p><p className="text-xs text-slate-500">{money(medicine.selling_price)} each · {line.quantity} available quantity selected</p></div><div className="flex items-center gap-2"><input aria-label={`Quantity of ${medicine.medicine_name}`} type="number" min="1" max={Math.max(1, Number(medicine.quantity_on_hand))} value={line.quantity} onChange={(event) => setItems((current) => current.map((item) => item.medicine_id === line.medicine_id ? { ...item, quantity: Math.min(Number(medicine.quantity_on_hand), Math.max(1, Number(event.target.value) || 1)) } : item))} className="h-9 w-20 rounded border border-slate-200 px-2 text-sm" /><span className="w-20 text-right text-sm font-bold">{money(Number(medicine.selling_price) * line.quantity)}</span><button type="button" onClick={() => setItems((current) => current.filter((item) => item.medicine_id !== line.medicine_id))} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${medicine.medicine_name}`}><X size={15} /></button></div></div>)}</div>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Discount amount
                <input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3" />
            </label>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-semibold uppercase text-slate-500">Customer total</p><p className="mt-1 text-lg font-extrabold">{money(Math.max(0, subtotal - (Number.isFinite(discountAmount) ? discountAmount : 0)))}</p><p className="text-xs text-slate-500">Items {money(subtotal)} · discount {money(discountAmount || 0)}</p></div>
        </div>
        <label className="mt-3 block text-sm font-semibold">Message to customer <span className="font-normal text-slate-500">(optional)</span>
            <input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={300} placeholder="Availability, substitutions, or delivery details" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal" />
        </label>
        <button type="button" disabled={!canManage || busy || !items.length || !Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > subtotal} onClick={() => onQuote(requestId, items, Number(discountAmount.toFixed(2)), message)} className="mt-3 min-h-[44px] w-full rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Sending quote…" : "Send medicine list and quote"}</button>
        <button type="button" disabled={!canManage || busy} onClick={() => onRelease(requestId)} className="mt-2 min-h-[44px] w-full rounded-lg border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Can’t fulfil this prescription · pass to next pharmacy</button>
    </div>;
}

/* ================= duty panel and live request alert ================= */
