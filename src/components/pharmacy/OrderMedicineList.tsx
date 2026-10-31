import type { OrderItem } from "./types";

export default function OrderMedicineList({
    items,
    money,
    compact = false,
}: {
    items: OrderItem[];
    money: (value: number) => string;
    compact?: boolean;
}) {
    if (!items.length) {
        return <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">No medicine items are linked to this order.</p>;
    }

    return (
        <ul className={`divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white ${compact ? "text-xs" : "text-sm"}`}>
            {items.map((item) => (
                <li key={item.id} className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-1 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800">{item.medicine?.name || "Medicine details unavailable"}</p>
                        <p className="mt-0.5 text-slate-500">
                            Strength: {item.medicine?.strength || "—"} | Form: {item.medicine?.dosage_form || "—"}
                            {item.medicine?.brand_name ? ` | Brand: ${item.medicine.brand_name}` : ""}
                        </p>
                    </div>
                    <div className="shrink-0 text-right text-slate-600">
                        <p>Quantity: {item.quantity} × {money(item.unit_selling_price)}</p>
                        <p className="font-bold text-slate-800">Item total: {money(item.line_total)}</p>
                    </div>
                </li>
            ))}
        </ul>
    );
}
