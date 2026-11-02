import { useState } from "react";
import { ShieldCheck, Crown, Sparkles, Bot } from "lucide-react";
import { usePharmacyMembership } from "./useMembership";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PharmacyMembership() {
  const { membership, plan, loading, error, isSilver } = usePharmacyMembership();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex items-center justify-center">
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-slate-200 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const planName = plan?.name || "Zero";
  const planPrice = plan?.price ?? 0;
  const isActive = membership?.status === "active";

  const sectionClass = isSilver
    ? "rounded-2xl border p-6 shadow-sm border-[#065c3f] bg-[#eef4f1]/40"
    : "rounded-2xl border p-6 shadow-sm border-slate-200 bg-white";

  const iconClass = isSilver
    ? "flex h-10 w-10 items-center justify-center rounded-full bg-[#065c3f] text-white"
    : "flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600";

  return (
    <section className={sectionClass}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={iconClass}>
            {isSilver ? <Crown size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Pharmacy {planName} Plan</h3>
            <p className="text-xs text-slate-500">
              {isActive ? "Active" : "Inactive"} · ₹{planPrice}/month
            </p>
          </div>
        </div>

        {!isSilver && (
          <Button
            onClick={() => setUpgradeOpen(true)}
            size="sm"
            className="bg-[#065c3f] hover:bg-[#0b7a55]"
          >
            Upgrade to Silver <Sparkles size={14} className="ml-1" />
          </Button>
        )}
      </div>

      {isSilver && (
        <div className="mt-4 grid gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
            <Sparkles size={14} className="text-green-600" />
            <span className="text-sm text-green-700 font-medium">Priority order notifications enabled</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
            <Crown size={14} className="text-green-600" />
            <span className="text-sm text-green-700 font-medium">Featured pharmacy badge displayed</span>
          </div>
        </div>
      )}

      {!isSilver && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <Bot size={16} className="text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-800">
              Upgrade to Silver (₹99/month) for priority orders, featured badge,
              and basic analytics.
            </p>
          </div>
        </div>
      )}

      {upgradeOpen && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="font-bold text-slate-900 mb-2">Upgrade Pharmacy to Silver — ₹99/month</h4>
          <p className="text-sm text-slate-600 mb-3">
            Unlock priority order notifications, featured badge, and basic analytics.
          </p>
          <Button
            onClick={() => {
              setUpgradeOpen(false);
              toast.success("Pharmacy upgraded to Silver (demo).");
            }}
            className="w-full bg-[#065c3f] hover:bg-[#0b7a55]"
          >
            Confirm Upgrade (Demo)
          </Button>
          <button
            onClick={() => setUpgradeOpen(false)}
            className="mt-2 w-full text-xs text-slate-500 underline underline-offset-4 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}