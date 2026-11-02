import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Sparkles, Crown, ArrowRight } from "lucide-react";
import { requireSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type MembershipPlan = {
  id: string;
  name: string;
  price: number;
  duration_months: number;
  features: string[];
  is_active: boolean;
};

export default function MembershipPlans() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const supabase = requireSupabase();
        const { data, error } = await supabase
          .from("membership_plans")
          .select("*")
          .eq("is_active", true)
          .order("price");
        if (error) throw error;
        const uniquePlans = (data || []).filter(
          (plan, index, self) =>
            index === self.findIndex((p) => p.name === plan.name)
        );
        setPlans(uniquePlans as MembershipPlan[]);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Failed to load plans");
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, []);

  const upgradeToSilver = async (planId: string) => {
    try {
      const supabase = requireSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/account");
        return;
      }

      await supabase
        .from("customer_memberships")
        .update({ status: "expired" })
        .eq("user_id", user.id)
        .eq("status", "active");

      const endsAt = new Date();
      endsAt.setMonth(endsAt.getMonth() + 1);

      const { error: insertError } = await supabase.from("customer_memberships").insert({
        user_id: user.id,
        plan_id: planId,
        status: "active",
        started_at: new Date().toISOString(),
        ends_at: endsAt.toISOString(),
        payment_ref: `DEMO_ORDER_${Date.now()}`,
      });

      if (insertError) throw insertError;

      toast.success("You are now on Silver plan! AI Assistant unlocked.");
      navigate("/profile");
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : "Upgrade failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-3 h-3 rounded-full bg-slate-200 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <section className="py-12">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl font-bold text-slate-900 mb-2">
            Choose Your Membership
          </h2>
          <p className="text-slate-600">
            Unlock the AI Assistant and premium features with Silver membership.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {plans.map((plan) => {
            const isSilver = plan.name === "Silver";
            const isFree = plan.name === "Zero";
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-6 flex flex-col ${
                  isSilver
                    ? "border-[#065c3f] bg-[#eef4f1]/50 shadow-lg"
                    : "border-slate-200 bg-white hover:shadow-md transition-shadow"
                }`}
              >
                <div className="mb-4 flex items-center gap-2">
                  {isSilver && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#065c3f] text-white text-xs font-bold">
                      <Crown size={12} />
                    </div>
                  )}
                  <span className={`font-bold text-lg ${
                    isSilver ? "text-[#065c3f]" : "text-slate-900"
                  }`}>
                    {plan.name}
                  </span>
                  {isFree && <span className="ml-2 px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-semibold">Default</span>}
                </div>

                <div className="mb-6">
                  <span className="font-display text-3xl font-extrabold text-slate-900">
                    ₹{plan.price}
                  </span>
                  <span className="text-slate-500 text-sm">
                    /{plan.duration_months} month
                  </span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                      {isSilver ? (
                        <ShieldCheck size={14} className="text-[#065c3f] mt-0.5 shrink-0" />
                      ) : (
                        <span className="text-slate-300 mt-0.5 shrink-0">—</span>
                      )}
                      {feature}
                    </li>
                  ))}
                </ul>

                {isFree ? (
                  <Button
                    variant="outline"
                    onClick={() => toast.info("You are already on the Zero plan.")}
                    className="w-full"
                  >
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    onClick={() => upgradeToSilver(plan.id)}
                    className="w-full bg-[#065c3f] hover:bg-[#0b7a55]"
                  >
                    Upgrade to Silver <ArrowRight size={16} className="ml-1" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-start gap-3">
            <Sparkles size={18} className="text-[#065c3f] mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-900">AI Assistant — Silver Exclusive</h4>
              <p className="text-sm text-slate-600 mt-1">
                Upgrade to Silver (₹99/month) to unlock the AI health assistant on the
                hospitals page. Get disease-based hospital recommendations near you.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-400 text-center">
          Demo mode: upgrades are simulated. No real payment is processed.
        </p>
      </div>
    </section>
  );
}



