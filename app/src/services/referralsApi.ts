import { supabase } from "@/integrations/supabase/client";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface ReferralSummary {
  code: string | null;
  total: number;
  signed_up: number;
  subscribed: number;
  rewarded: number;
  credit_earned_usd: number;
  recent: Array<{
    status: "pending" | "subscribed" | "rewarded" | "rejected";
    created_at: string;
    referee_user_id: string;
  }>;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchReferralSummary(): Promise<ReferralSummary> {
  const res = await fetch(`${API_BASE}/v1/referrals/me`, {
    headers: await authHeader(),
  });
  if (!res.ok) throw new Error(`Failed to load referrals: ${res.status}`);
  return res.json();
}

export async function redeemReferralCode(
  code: string
): Promise<{ accepted: boolean; reason?: string }> {
  const res = await fetch(`${API_BASE}/v1/referrals/redeem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    return { accepted: false, reason: `http_${res.status}` };
  }
  return res.json();
}
