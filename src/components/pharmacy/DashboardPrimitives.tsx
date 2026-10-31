import type { ReactNode } from "react";
import { ArrowRight, ClipboardList } from "lucide-react";

const TONES: Record<string, { chip: string; bar: string }> = {
    green: { chip: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-600" },
    blue: { chip: "bg-blue-50 text-blue-700", bar: "bg-blue-600" },
    amber: { chip: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
    violet: { chip: "bg-violet-50 text-violet-700", bar: "bg-violet-600" },
    rose: { chip: "bg-rose-50 text-rose-700", bar: "bg-rose-500" },
};

export function Metric({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string | number; hint: string; tone: string }) {
    const toneStyles = TONES[tone] || TONES.green;
    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`absolute inset-x-0 top-0 h-1 ${toneStyles.bar}`} />
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">{label}</span>
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${toneStyles.chip}`}>{icon}</span>
            </div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{hint}</p>
        </div>
    );
}

export function Section({ icon, tone, title, detail, cta, onClick }: { icon: ReactNode; tone: string; title: string; detail: string; cta: string; onClick: () => void }) {
    const toneStyles = TONES[tone] || TONES.green;
    return (
        <button onClick={onClick} className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${toneStyles.chip}`}>{icon}</span>
            <span className="text-base font-extrabold">{title}</span>
            <span className="text-sm leading-5 text-slate-500">{detail}</span>
            <span className="mt-auto text-sm font-bold text-emerald-700">{cta} <ArrowRight className="ml-1 inline" size={14} /></span>
        </button>
    );
}

export function Empty({ title, detail }: { title: string; detail: string }) {
    return (
        <div className="py-8 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><ClipboardList /></span>
            <p className="mt-3 font-bold">{title}</p>
            <p className="mt-1 text-sm text-slate-500">{detail}</p>
        </div>
    );
}

export function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
        <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 break-words text-sm font-semibold">{value || "Not provided"}</p>
        </div>
    );
}
