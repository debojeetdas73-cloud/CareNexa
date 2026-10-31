import { BellRing } from "lucide-react";

type Props = {
    customerName: string;
    fulfillment: string;
    itemCount: number;
    total: string;
    secondsLeft: number;
    totalSeconds?: number;
    soundOn: boolean;
    onEnableSound: () => void;
    onOpen: () => void;
    onDismiss: () => void;
};

export default function IncomingOrderAlert({ customerName, fulfillment, itemCount, total, secondsLeft, totalSeconds = 30, soundOn, onEnableSound, onOpen, onDismiss }: Props) {
    const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
    return (
        <div role="alert" aria-live="assertive" className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-md overflow-hidden rounded-3xl border-2 border-emerald-600 bg-white shadow-2xl">
            <div className="h-2 bg-emerald-100"><div className="h-full bg-emerald-600 transition-[width] duration-200" style={{ width: `${pct}%` }} /></div>
            <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="grid h-12 w-12 animate-pulse place-items-center rounded-2xl bg-emerald-600 text-white"><BellRing size={22} /></span>
                        <div>
                            <p className="text-lg font-extrabold text-slate-900">New order</p>
                            <p className="text-sm text-slate-600">{customerName} · {fulfillment}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl font-black tabular-nums text-emerald-700">{secondsLeft}s</p>
                        <p className="text-[11px] font-bold uppercase text-slate-500">to respond</p>
                    </div>
                </div>
                <p className="text-sm text-slate-600">{itemCount} item{itemCount === 1 ? "" : "s"} · {total}</p>
                {!soundOn && (
                    <button type="button" onClick={onEnableSound} className="w-full rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Sound is off. Tap to turn it on.</button>
                )}
                <div className="flex gap-2">
                    <button type="button" onClick={onOpen} className="min-h-[46px] flex-1 rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white hover:bg-emerald-700">Open order</button>
                    <button type="button" onClick={onDismiss} className="min-h-[46px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700">Silence</button>
                </div>
            </div>
        </div>
    );
}