import OrderMedicineList from "./OrderMedicineList";
import type { Order } from "./types";
import { X } from "lucide-react";

const toCents = (amount: number) => Math.round(amount * 100);

export default function OrderQuoteModal({
    order,
    discount,
    onDiscountChange,
    message,
    onMessageChange,
    busy,
    money,
    onClose,
    onSubmit,
}: {
    order: Order;
    discount: string;
    onDiscountChange: (value: string) => void;
    message: string;
    onMessageChange: (value: string) => void;
    busy: boolean;
    money: (value: number) => string;
    onClose: () => void;
    onSubmit: () => void;
}) {
    const itemSubtotal = order.items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const enteredDiscount = discount.trim() === "" ? Number.NaN : Number(discount);
    const discountIsValid = Number.isFinite(enteredDiscount)
        && enteredDiscount >= 0
        && toCents(enteredDiscount) <= toCents(itemSubtotal)
        && Math.abs(enteredDiscount * 100 - toCents(enteredDiscount)) < 0.0001;
    const totalsMatch = Number.isFinite(Number(order.subtotal)) && toCents(itemSubtotal) === toCents(Number(order.subtotal));
    const finalTotal = discountIsValid ? Math.max(0, (toCents(itemSubtotal) - toCents(enteredDiscount)) / 100) : itemSubtotal;

    return (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" role="presentation">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="order-quote-title"
                className="my-4 max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="order-quote-title" className="text-xl font-extrabold">Review order &amp; send quote</h2>
                        <p className="mt-1 text-sm text-slate-500">{order.order_number || `Order ${order.id.slice(0, 8)}`} · {order.customer_name}</p>
                    </div>
                    <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-slate-100" aria-label="Close quote form">
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-5">
                    <OrderMedicineList items={order.items} money={money} />
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                    <p className="flex justify-between gap-4"><span>Subtotal</span><strong>{money(itemSubtotal)}</strong></p>
                    <p className="mt-2 flex justify-between gap-4"><span>Discount</span><strong>{money(discountIsValid ? enteredDiscount : 0)}</strong></p>
                    <p className="mt-2 flex justify-between gap-4 border-t border-slate-200 pt-2 text-base"><span>Final total</span><strong>{money(finalTotal)}</strong></p>
                </div>

                {!totalsMatch && (
                    <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        The item subtotal ({money(itemSubtotal)}) does not match the order subtotal ({money(Number(order.subtotal))}). Refresh the order before sending a quote.
                    </p>
                )}

                <label className="mt-4 block text-sm font-semibold">
                    Discount (₹)
                    <input
                        type="number"
                        min="0"
                        max={itemSubtotal}
                        step="0.01"
                        value={discount}
                        onChange={(event) => onDiscountChange(event.target.value)}
                        aria-invalid={!discountIsValid}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3"
                    />
                </label>
                {!discountIsValid && <p role="alert" className="mt-1 text-xs text-rose-700">Enter a discount from ₹0 to {money(itemSubtotal)} with up to two decimal places.</p>}

                <label className="mt-4 block text-sm font-semibold">
                    Note for customer (optional)
                    <textarea
                        value={message}
                        onChange={(event) => onMessageChange(event.target.value)}
                        maxLength={500}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-200 p-3"
                        placeholder="Add a message about availability or pickup"
                    />
                </label>
                <p className="mt-3 text-xs leading-5 text-slate-500">Sending the quote reserves the requested stock. The order will only move to fulfillment after the customer accepts.</p>

                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button>
                    <button
                        type="button"
                        disabled={busy || !order.items.length || !totalsMatch || !discountIsValid}
                        onClick={onSubmit}
                        className="min-h-[44px] rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {busy ? "Sending…" : "Send quote"}
                    </button>
                </div>
            </section>
        </div>
    );
}
