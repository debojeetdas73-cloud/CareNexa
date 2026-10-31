import { useMemo } from "react";
import { Clock3, Phone, Search, ShoppingBag, Users, BadgeCheck } from "lucide-react";
import { Metric } from "@/components/pharmacy/DashboardPrimitives";

type Customer = {
    key: string;
    name: string;
    phone: string;
    orders: number;
    spent: number;
    last: string;
    days: number;
    type: string;
};

export default function PharmacyCustomers({
    customers,
    query,
    onQueryChange,
    money,
    averageOrder,
}: {
    customers: Customer[];
    query: string;
    onQueryChange: (query: string) => void;
    money: (amount: number) => string;
    averageOrder: number;
}) {
    const repeatPct = customers.length ? Math.round((customers.filter((customer) => customer.orders > 1).length / customers.length) * 100) : 0;
    const newThisMonth = customers.filter((customer) => customer.orders === 1 && customer.days <= 30).length;
    const filteredCustomers = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return customers.filter((customer) => !normalizedQuery || customer.name.toLowerCase().includes(normalizedQuery) || customer.phone.includes(normalizedQuery));
    }, [customers, query]);

    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric icon={<Users size={20} />} label="Total customers" value={customers.length} hint={`${newThisMonth} new in the last 30 days`} tone="violet" />
                <Metric icon={<BadgeCheck size={20} />} label="Repeat customers" value={`${repeatPct}%`} hint="Ordered more than once" tone="green" />
                <Metric icon={<ShoppingBag size={20} />} label="Average order" value={money(Math.round(averageOrder))} hint="Across completed orders" tone="blue" />
                <Metric icon={<Clock3 size={20} />} label="At risk" value={customers.filter((customer) => customer.type === "At risk").length} hint="No order in 30+ days" tone="amber" />
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-extrabold">All customers</h2>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search by name or phone" aria-label="Search customers" className="min-h-[44px] w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 sm:w-64" />
                    </div>
                </div>
                <div className="mt-4 overflow-auto rounded-xl border border-slate-100">
                    <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>{["Customer", "Orders", "Total spent", "Last order", "Type", ""].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3">{heading}</th>)}</tr>
                        </thead>
                        <tbody>
                            {filteredCustomers.map((customer) => (
                                <tr key={customer.key} className="border-t border-slate-100 hover:bg-slate-50/70">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-xs font-extrabold text-emerald-700">{customer.name.trim().slice(0, 2).toUpperCase()}</span>
                                            <div><p className="font-bold">{customer.name}</p><p className="text-xs text-slate-500">{customer.phone || "No phone"}</p></div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">{customer.orders}</td>
                                    <td className="px-4 py-3 font-extrabold">{money(customer.spent)}</td>
                                    <td className={`whitespace-nowrap px-4 py-3 ${customer.type === "At risk" ? "font-bold text-amber-700" : "text-slate-500"}`}>{customer.days === 0 ? "Today" : `${customer.days} days ago`}</td>
                                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${customer.type === "Regular" ? "bg-violet-50 text-violet-800" : customer.type === "At risk" ? "bg-amber-50 text-amber-800" : customer.type === "New" ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"}`}>{customer.type}</span></td>
                                    <td className="px-4 py-3 text-right">{customer.phone && <a href={`tel:${customer.phone}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><Phone size={13} /> Call</a>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredCustomers.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No customers yet. They will appear after the first order.</p>}
                </div>
            </div>
        </div>
    );
}
