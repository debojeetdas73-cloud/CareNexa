import { useState, useEffect, useCallback } from "react";
import { requireSupabase } from "@/lib/supabase";

type MembershipPlan = {
  id: string;
  name: string;
  price: number;
  duration_months: number;
  features: string[];
  is_active: boolean;
};

type CustomerMembership = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  ends_at: string | null;
  payment_ref: string | null;
  plans?: MembershipPlan;
};

type PharmacyMembership = {
  id: string;
  pharmacy_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  ends_at: string | null;
  payment_ref: string | null;
  plans?: MembershipPlan;
};

export function useCustomerMembership() {
  const [membership, setMembership] = useState<CustomerMembership | null>(null);
  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMembership = useCallback(async () => {
    try {
      const supabase = requireSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("customer_memberships")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setMembership(data as CustomerMembership);
        // Fetch plan separately
        const { data: planData } = await supabase
          .from("membership_plans")
          .select("*")
          .eq("id", data.plan_id)
          .maybeSingle();
        setPlan(planData as MembershipPlan | null);
      } else {
        // Assign Zero plan by default
        const { data: plans } = await supabase
          .from("membership_plans")
          .select("*")
          .eq("name", "Zero")
          .eq("is_active", true)
          .maybeSingle();

        if (plans) {
          const { data: newMember, error: insertError } = await supabase
            .from("customer_memberships")
            .insert({
              user_id: user.id,
              plan_id: plans.id,
              status: "active",
            })
            .select("*")
            .single();

          if (!insertError && newMember) {
            setMembership(newMember as CustomerMembership);
            setPlan(plans as MembershipPlan | null);
          }
        }
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load membership");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembership();
  }, [loadMembership]);

  const isSilver = plan?.name === "Silver" && membership?.status === "active";

  return {
    membership,
    plan,
    loading,
    error,
    isSilver,
    hasAIAccess: isSilver,
  };
}

export function usePharmacyMembership() {
  const [membership, setMembership] = useState<PharmacyMembership | null>(null);
  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMembership = useCallback(async () => {
    try {
      const supabase = requireSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Find pharmacies owned by this user
      const { data: pharmacies } = await supabase
        .from("pharmacies")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (!pharmacies) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("pharmacy_memberships")
        .select("*")
        .eq("pharmacy_id", pharmacies.id)
        .eq("status", "active")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setMembership(data as PharmacyMembership);
        // Fetch plan separately
        const { data: planData } = await supabase
          .from("membership_plans")
          .select("*")
          .eq("id", data.plan_id)
          .maybeSingle();
        setPlan(planData as MembershipPlan | null);
      } else {
        // Assign Zero plan by default
        const { data: plans } = await supabase
          .from("membership_plans")
          .select("*")
          .eq("name", "Zero")
          .eq("is_active", true)
          .maybeSingle();

        if (plans) {
          const { data: newMember, error: insertError } = await supabase
            .from("pharmacy_memberships")
            .insert({
              pharmacy_id: pharmacies.id,
              plan_id: plans.id,
              status: "active",
            })
            .select("*")
            .single();

          if (!insertError && newMember) {
            setMembership(newMember as PharmacyMembership);
            setPlan(plans as MembershipPlan | null);
          }
        }
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load pharmacy membership");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembership();
  }, [loadMembership]);

  return {
    membership,
    plan,
    loading,
    error,
    isSilver: plan?.name === "Silver" && membership?.status === "active",
  };
}