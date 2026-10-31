import { BadgeCheck, LockKeyhole, UserRound } from "lucide-react";
import type { CustomerProfileUser } from "./types";

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="border-b border-[#e7eee9] pb-3 last:border-0 last:pb-0">
    <dt className="text-[10px] font-bold uppercase tracking-[.08em] text-[#5b6f66]">{label}</dt>
    <dd className="mt-1 break-words font-semibold text-[#10231b]">{value || "Not provided"}</dd>
    {hint && <p className="mt-0.5 text-xs text-[#718278]">{hint}</p>}
  </div>;
}

export default function CustomerSettings({ user, onSignOut }: { user: CustomerProfileUser | null; onSignOut: () => void }) {
  const metadata = user?.user_metadata || {};

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
    <section className="rounded-2xl border border-[#dfe8e3] bg-white p-5 shadow-[0_1px_2px_rgba(16,35,27,.04)] sm:p-6" aria-labelledby="customer-details-heading">
      <div className="flex items-center gap-3 border-b border-[#e7eee9] pb-4">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#dff3ea] text-[#0b6a49]"><UserRound size={20}/></span>
        <div><h2 id="customer-details-heading" className="font-display text-lg font-bold text-[#10231b]">Personal information</h2><p className="mt-0.5 text-sm text-[#5b6f66]">Details connected to your customer account</p></div>
      </div>
      <dl className="mt-5 grid gap-x-7 gap-y-4 sm:grid-cols-2">
        <Field label="Full name" value={metadata.full_name || ""}/>
        <Field label="Email address" value={user?.email || ""} hint="Tied to your sign-in"/>
        <Field label="Phone number" value={metadata.phone || ""}/>
        <Field label="Age" value={metadata.age ? String(metadata.age) : ""}/>
        <Field label="Blood group" value={metadata.blood_group || ""}/>
        <Field label="City" value={metadata.city || ""}/>
        <Field label="District" value={metadata.district || ""}/>
        <Field label="Account created" value={user?.created_at ? new Date(user.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" }) : ""}/>
      </dl>
    </section>

    <section className="flex flex-col rounded-2xl border border-[#dfe8e3] bg-white p-5 shadow-[0_1px_2px_rgba(16,35,27,.04)] sm:p-6" aria-labelledby="customer-security-heading">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#dff3ea] text-[#0b6a49]"><LockKeyhole size={19}/></span>
        <div><h2 id="customer-security-heading" className="font-display text-lg font-bold text-[#10231b]">Account security</h2><p className="mt-0.5 text-sm text-[#5b6f66]">Your account is protected by CareNexa sign-in.</p></div>
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#eef4f1] px-3 py-3 text-sm text-[#345448]">
        <BadgeCheck size={17} className="shrink-0 text-[#0b7a55]"/>
        <span className="min-w-0 break-all">Signed in as {user?.email || "your customer account"}</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#5b6f66]">Keep your email access safe. Sign out when you finish on a shared device.</p>
      <button onClick={onSignOut} className="mt-auto min-h-10 self-start rounded-full border border-[#e8cbd0] px-4 text-sm font-semibold text-[#9b1b34] hover:border-[#9b1b34] hover:bg-[#fff7f8]">Sign out</button>
    </section>
  </div>;
}
