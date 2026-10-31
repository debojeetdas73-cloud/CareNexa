import { ChartNoAxesCombined, ShoppingBag, Wallet } from "lucide-react";
import { Empty, Metric } from "@/components/pharmacy/DashboardPrimitives";

type Customer = { key: string; name: string; orders: number; spent: number };
type SeriesPoint = { date: Date; total: number; count: number };
type Earnings = {
    week: number;
    month: number;
    total: number;
    discounts: number;
    avg: number;
    series: (days: number) => SeriesPoint[];
    deliveryTotal: number;
    pickupTotal: number;
};

export default function PharmacyEarnings({
    earnings,
    completedCount,
    customers,
    range,
    onRangeChange,
    money,
}: {
    earnings: Earnings;
    completedCount: number;
    customers: Customer[];
    range: 7 | 30;
    onRangeChange: (range: 7 | 30) => void;
    money: (amount: number) => string;
}) {
    const topCustomers = customers.filter((customer) => customer.spent > 0).slice(0, 5);
    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-[#0b2f2c] p-5 text-white">
                    <p className="text-sm font-semibold text-slate-300">Last 30 days</p>
                    <p className="mt-3 text-3xl font-extrabold tracking-tight">{money(earnings.month)}</p>
                    <p className="mt-2 text-xs text-slate-400">Completed orders</p>
                </div>
                <Metric icon={<Wallet size={20} />} label="This week" value={money(earnings.week)} hint="Last 7 days" tone="green" />
                <Metric icon={<ChartNoAxesCombined size={20} />} label="All-time sales" value={money(earnings.total)} hint={`${completedCount} completed orders`} tone="blue" />
                <Metric icon={<ShoppingBag size={20} />} label="Discounts given" value={money(earnings.discounts)} hint="On completed orders" tone="amber" />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><h2 className="text-lg font-extrabold">Daily sales</h2><p className="mt-1 text-sm text-slate-500">Completed orders, last {range} days</p></div>
                        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                            {([7, 30] as const).map((days) => <button key={days} onClick={() => onRangeChange(days)} aria-pressed={range === days} className={`min-h-[36px] rounded-lg px-3.5 text-xs font-bold ${range === days ? "bg-white shadow-sm" : "text-slate-500"}`}>{days}D</button>)}
                        </div>
                    </div>
                    {(() => {
                        const points = earnings.series(range);
                        const max = Math.max(1, ...points.map((point) => point.total));
                        return (
                            <>
                                <div className="mt-6 flex h-52 items-end gap-1">
                                    {points.map((point) => <div key={point.date.toISOString()} title={`${point.date.toLocaleDateString()}: ${money(point.total)} (${point.count} orders)`} className="flex h-full flex-1 items-end"><div className={`w-full rounded-t ${point.total > 0 ? "bg-emerald-600" : "bg-slate-100"}`} style={{ height: `${Math.max(point.total > 0 ? 4 : 2, (point.total / max) * 100)}%` }} /></div>)}
                                </div>
                                <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                                    <span>{points[0].date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                                    <span>{points[points.length - 1].date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                                </div>
                            </>
                        );
                    })()}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-extrabold">Sales breakdown</h2>
                    <div className="mt-4 space-y-1 text-sm">
                        <div className="flex justify-between border-b border-slate-100 py-3"><span>Delivery orders</span><b>{money(earnings.deliveryTotal)}</b></div>
                        <div className="flex justify-between border-b border-slate-100 py-3"><span>Pickup orders</span><b>{money(earnings.pickupTotal)}</b></div>
                        <div className="flex justify-between border-b border-slate-100 py-3"><span>Average order value</span><b>{money(Math.round(earnings.avg))}</b></div>
                        <div className="flex justify-between rounded-xl bg-emerald-50 px-3 py-3.5"><b>Total sales</b><b className="text-emerald-800">{money(earnings.total)}</b></div>
                    </div>
                    <p className="mt-4 text-xs leading-5 text-slate-500">Payouts and platform commission will appear here once settlements are enabled for your account.</p>
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold">Top customers</h2>
                <div className="mt-3 divide-y divide-slate-100">
                    {topCustomers.map((customer, index) => (
                        <div key={customer.key} className="flex items-center gap-3 py-3">
                            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-extrabold text-slate-600">{index + 1}</span>
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{customer.name}</p><p className="text-xs text-slate-500">{customer.orders} orders</p></div>
                            <b className="text-sm">{money(customer.spent)}</b>
                        </div>
                    ))}
                    {topCustomers.length === 0 && <Empty title="No completed sales yet" detail="Your best customers will show up here." />}
                </div>
            </div>
        </div>
    );
}
