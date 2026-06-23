import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Megaphone,
  MousePointerClick,
  Crown,
  Link2,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { fetchReferralSummary } from "@/services/referralsApi";

const Referrals = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["referrals", "me"],
    queryFn: fetchReferralSummary,
    staleTime: 30_000,
  });

  const referralLink = data?.code
    ? `${window.location.origin}/?ref=${data.code}`
    : "";

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({ title: "Copied", description: "Referral link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "destructive",
        title: "Couldn't copy",
        description: "Select the link and copy it manually.",
      });
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight">
        Give a month of Pro.
      </h1>
      <h2 className="text-3xl font-semibold text-foreground tracking-tight mt-1">
        Get a month of Pro.
      </h2>

      <div className="mt-10">
        <p className="text-sm font-medium text-foreground mb-5">How it works</p>
        <ul className="space-y-4">
          <li className="flex items-center gap-4 text-sm text-foreground">
            <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Megaphone className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            </span>
            Share your referral link
          </li>
          <li className="flex items-center gap-4 text-sm text-foreground">
            <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <MousePointerClick className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            </span>
            They sign up and get their first month free
          </li>
          <li className="flex items-center gap-4 text-sm text-foreground">
            <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Crown className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            </span>
            You get a free month when their first paid invoice clears
          </li>
        </ul>
      </div>

      <div className="mt-10">
        <p className="text-sm font-medium text-foreground mb-3">Your referral link</p>
        {isLoading ? (
          <div className="h-11 flex items-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading
          </div>
        ) : error || !data?.code ? (
          <div className="text-sm text-destructive">
            Couldn't load your referral code. Try refreshing.
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 h-11 px-3 rounded-md border border-border bg-card">
              <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
              <span className="text-sm text-foreground truncate">{referralLink}</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-11 px-5"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1.5" /> Copy
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="mt-10 grid grid-cols-3 gap-3">
          <StatCard label="Signed up" value={data.signed_up + data.subscribed + data.rewarded} />
          <StatCard label="Subscribed" value={data.subscribed + data.rewarded} />
          <StatCard label="Months earned" value={data.months_earned} highlight />
        </div>
      )}

      {data && data.total === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          No referrals yet. Share your link to get started.
        </p>
      )}
    </div>
  );
};

const StatCard = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) => (
  <div
    className={
      "rounded-lg border p-4 " +
      (highlight
        ? "border-[hsl(var(--brand-blue)/0.4)] bg-[hsl(var(--brand-blue)/0.06)]"
        : "border-border bg-card")
    }
  >
    <p className="text-xs text-muted-foreground">{label}</p>
    <p
      className={
        "mt-1 text-2xl font-semibold " +
        (highlight ? "text-[hsl(var(--brand-blue-strong))]" : "text-foreground")
      }
    >
      {value}
    </p>
  </div>
);

export default Referrals;
