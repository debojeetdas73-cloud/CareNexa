import { useEffect, useRef } from "react";
import { ArrowRight, BellRing, Check, FileText, Volume2, VolumeX } from "lucide-react";
import type { PharmacyRecord, PrescriptionOffer } from "./types";

export const REQUEST_WINDOW_MS = 30_000;
export const offerDeadline = (offer: PrescriptionOffer) =>
    Math.min(new Date(offer.expires_at).getTime(), new Date(offer.created_at).getTime() + REQUEST_WINDOW_MS);
export const clock = (milliseconds: number) => {
    const total = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
function DutySwitch({ active, disabled, onToggle, large = false }: { active: boolean; disabled: boolean; onToggle: () => void; large?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={active ? "Go off duty" : "Go on duty"}
            disabled={disabled}
            onClick={onToggle}
            className={`relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${large ? "h-12 w-[84px]" : "h-7 w-12"} ${active ? "bg-emerald-600" : "bg-slate-300"}`}
        >
            <span className={`inline-block transform rounded-full bg-white shadow transition-transform ${large ? "h-10 w-10" : "h-5 w-5"} ${active ? (large ? "translate-x-[38px]" : "translate-x-6") : "translate-x-1"}`} />
        </button>
    );
}

function OfferRow({ offer, now, busy, canManage, onAccept, onPass }: { offer: PrescriptionOffer; now: number; busy: boolean; canManage: boolean; onAccept: () => void; onPass: () => void }) {
    const left = offerDeadline(offer) - now;
    const expired = left <= 0;
    const urgent = left <= 10_000;
    const pct = Math.max(0, Math.min(100, (left / REQUEST_WINDOW_MS) * 100));
    return (
        <article className="rounded-2xl border border-amber-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><FileText size={18} /></span>
                    <div className="min-w-0">
                        <p className="text-sm font-extrabold">{offer.fulfillment_choice === "delivery" ? "Delivery" : "Pickup"} prescription request</p>
                        <p className="text-xs text-slate-500">{offer.distance_km !== null ? `${offer.distance_km} km away` : "Distance unavailable"} · details open after you accept</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`w-12 text-right text-lg font-extrabold tabular-nums ${urgent ? "text-rose-600" : "text-emerald-700"}`}>{expired ? "0:00" : clock(left)}</span>
                    <button disabled={!canManage || busy || expired} onClick={onAccept} className="min-h-[40px] rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{busy ? "Opening…" : expired ? "Passing on…" : "Accept & review"}</button>
                    <button disabled={!canManage || busy || expired} onClick={onPass} className="min-h-[40px] rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Pass</button>
                </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className={`h-full rounded-full transition-[width] duration-300 ${urgent ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
            </div>
        </article>
    );
}

export function DutyPanel({
    pharmacy, verified, active, dutyBusy, onToggleDuty, soundOn, onToggleSound, onTestRing,
    newOrders, rxWaiting, rxReview, doneToday, offers, now, busyId, canManage, onClaim, onReject, onOpenOrders, onOpenProfile,
}: {
    pharmacy: PharmacyRecord;
    verified: boolean;
    active: boolean;
    dutyBusy: boolean;
    onToggleDuty: () => void;
    soundOn: boolean;
    onToggleSound: () => void;
    onTestRing: () => void;
    newOrders: number;
    rxWaiting: number;
    rxReview: number;
    doneToday: number;
    offers: PrescriptionOffer[];
    now: number;
    busyId: string | null;
    canManage: boolean;
    onClaim: (id: string) => void;
    onReject: (id: string) => void;
    onOpenOrders: () => void;
    onOpenProfile: () => void;
}) {
    const stats: Array<[string, number]> = [["New orders", newOrders], ["Prescription requests", rxWaiting], ["To review", rxReview], ["Done today", doneToday]];
    return (
        <section aria-label="Duty and live requests" className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${active ? "border-emerald-200" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5 md:p-6">
                <div className="flex items-center gap-4">
                    <DutySwitch large active={active} disabled={!verified || dutyBusy} onToggle={onToggleDuty} />
                    <div>
                        <p className="text-2xl font-extrabold leading-tight">{active ? "On duty" : "Off duty"}</p>
                        <p className="text-sm text-slate-500">
                            {!verified ? "Approval required before you can go on duty" : active ? `${pharmacy.name} is receiving nearby requests` : "Go on duty to receive requests"}
                        </p>
                    </div>
                </div>
                <dl className="ml-auto flex flex-wrap gap-2">
                    {stats.map(([label, n]) => (
                        <div key={label} className="min-w-[96px] rounded-xl bg-slate-50 px-3.5 py-2">
                            <dd className="text-xl font-extrabold tabular-nums leading-tight">{n}</dd>
                            <dt className="text-xs text-slate-500">{label}</dt>
                        </div>
                    ))}
                </dl>
            </div>

            <div className={`border-t px-5 py-4 md:px-6 ${!verified ? "border-amber-100 bg-amber-50" : !active ? "border-slate-100 bg-slate-50" : offers.length ? "border-amber-100 bg-amber-50/60" : "border-emerald-100 bg-emerald-50/60"}`}>
                {!verified ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-amber-900">
                        <p className="font-semibold">Your pharmacy is {pharmacy.verification_status || "pending review"}. Finish verification to receive requests.</p>
                        <button onClick={onOpenProfile} className="min-h-[40px] rounded-lg border border-amber-300 bg-white px-4 text-sm font-bold">View profile</button>
                    </div>
                ) : !active ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-600">You are off duty. Customers nearby cannot send requests to this pharmacy.</p>
                        <button disabled={dutyBusy} onClick={onToggleDuty} className="min-h-[44px] rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{dutyBusy ? "Going on duty…" : "Go on duty"}</button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="flex items-center gap-3 text-sm font-bold text-emerald-900">
                                <span className="relative flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                                </span>
                                {offers.length ? `${offers.length} request${offers.length === 1 ? "" : "s"} waiting. Answer within 30 seconds.` : "Waiting for requests. Keep this screen open."}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <button onClick={onToggleSound} aria-pressed={soundOn} className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-xs font-bold ${soundOn ? "border-emerald-200 bg-white text-emerald-800" : "border-amber-300 bg-amber-100 text-amber-900"}`}>
                                    {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />} {soundOn ? "Ring on" : "Ring off. Tap to turn on"}
                                </button>
                                <button onClick={onTestRing} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><BellRing size={15} /> Test ring</button>
                                {rxReview > 0 && <button onClick={onOpenOrders} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700"><FileText size={15} /> {rxReview} to review <ArrowRight size={14} /></button>}
                            </div>
                        </div>
                        {offers.length > 0 && (
                            <div className="space-y-2">
                                {offers.map((offer) => (
                                    <OfferRow key={offer.id} offer={offer} now={now} busy={busyId === offer.id} canManage={canManage} onAccept={() => onClaim(offer.id)} onPass={() => onReject(offer.id)} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

export function IncomingRequestAlert({
    offer, now, busy, soundOn, onEnableSound, onAccept, onPass,
}: {
    offer: PrescriptionOffer;
    now: number;
    busy: boolean;
    soundOn: boolean;
    onEnableSound: () => void;
    onAccept: () => void;
    onPass: () => void;
}) {
    const acceptRef = useRef<HTMLButtonElement>(null);
    const remaining = Math.max(0, (offerDeadline(offer) - now) / 1000);
    const seconds = REQUEST_WINDOW_MS / 1000;
    const circumference = 2 * Math.PI * 78;
    const level = remaining <= 5 ? "red" : remaining <= 10 ? "amber" : "green";
    const stroke = level === "red" ? "#e11d48" : level === "amber" ? "#f59e0b" : "#059669";
    useEffect(() => { acceptRef.current?.focus(); }, [offer.id]);
    return (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="incoming-title" aria-describedby="incoming-desc">
            <section className="relative w-full max-w-md rounded-[28px] bg-white p-6 text-center shadow-2xl">
                <span aria-hidden="true" className={`pointer-events-none absolute -inset-1.5 animate-pulse rounded-[34px] border-4 ${level === "red" ? "border-rose-400/70" : level === "amber" ? "border-amber-400/70" : "border-emerald-400/70"}`} />
                <div className="relative flex flex-col items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900"><BellRing size={14} /> New prescription request</span>
                    <h2 id="incoming-title" className="text-2xl font-extrabold leading-tight">Accept within 30 seconds</h2>
                    <div className="relative h-44 w-44" aria-hidden="true">
                        <svg viewBox="0 0 176 176" className="h-full w-full -rotate-90">
                            <circle cx="88" cy="88" r="78" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                            <circle cx="88" cy="88" r="78" fill="none" stroke={stroke} strokeWidth="12" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(1, remaining / seconds))} />
                        </svg>
                        <span className="absolute inset-0 grid place-content-center text-6xl font-extrabold tabular-nums">{Math.ceil(remaining)}</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 text-xs font-bold">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{offer.fulfillment_choice === "delivery" ? "Delivery" : "Pickup"}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{offer.distance_km !== null ? `${offer.distance_km} km away` : "Distance unavailable"}</span>
                    </div>
                    <p id="incoming-desc" className="text-xs text-slate-500">Customer and prescription details stay private until you accept.</p>
                    {!soundOn && <button onClick={onEnableSound} className="min-h-[40px] rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900"><VolumeX className="mr-1 inline" size={14} /> Sound is off. Tap to turn on the ring</button>}
                    <button ref={acceptRef} disabled={busy || remaining <= 0} onClick={onAccept} className="inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"><Check size={22} /> {busy ? "Opening…" : "Accept and check stock"}</button>
                    <button disabled={busy || remaining <= 0} onClick={onPass} className="min-h-[48px] w-full rounded-2xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Pass to next pharmacy</button>
                    <p className="text-xs text-slate-500">If you pass or do not answer, the next nearby pharmacy gets this request.</p>
                </div>
            </section>
        </div>
    );
}
