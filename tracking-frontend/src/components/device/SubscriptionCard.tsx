import { useEffect, useState } from "react";
import { CalendarClock, ShieldCheck } from "lucide-react";

import { getSubscription, type Subscription, type Warranty } from "../../api/devices";
import { useLanguage } from "../../context/LanguageContext";
import { Badge, Card, CardHeader, Skeleton } from "../ui";

/*
Plan and warranty.

Two clocks that are easy to confuse, so they are labelled and shown separately:
platform access (renewable, sold per unit) and hardware cover (runs from the
purchase date, not from activation).

A device with neither is not an error state — a unit that has never been
activated genuinely has no plan — so the card renders nothing rather than
inventing an "unknown" row.
*/

export default function SubscriptionCard({ serial }: { serial: string }) {
  const { t } = useLanguage();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSubscription(serial)
      .then((data) => {
        setSubscription(data.subscription);
        setWarranty(data.warranty);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serial]);

  if (loading) return <Skeleton className="h-32 rounded-card" />;
  if (!subscription && !warranty?.expires_at) return null;

  return (
    <Card flush>
      <CardHeader title={t("plan.title")} subtitle={t("plan.subtitle")} />

      <div className="p-5 space-y-4">
        {subscription && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-content-muted">
                <CalendarClock className="w-3.5 h-3.5" />
                {t("plan.access")}
              </p>
              <p className="text-sm font-medium text-content mt-1">
                {t(`plan.${subscription.plan}`)}
              </p>
              <p className="text-xs text-content-muted mt-0.5 tnum">
                {t("plan.until")} {new Date(subscription.expires_at).toLocaleDateString()}
              </p>
            </div>

            <Badge
              tone={
                !subscription.is_active
                  ? "critical"
                  : subscription.is_expiring
                    ? "warning"
                    : "good"
              }
            >
              {!subscription.is_active
                ? t("plan.expired")
                : t("plan.days.left").replace("{days}", String(subscription.days_remaining))}
            </Badge>
          </div>
        )}

        {warranty?.expires_at && (
          <div className="flex items-start justify-between gap-3 border-t border-line pt-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-content-muted">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t("plan.warranty")}
              </p>
              <p className="text-sm font-medium text-content mt-1 tnum">
                {t("plan.months").replace("{months}", String(warranty.months))}
              </p>
              <p className="text-xs text-content-muted mt-0.5 tnum">
                {t("plan.until")} {new Date(warranty.expires_at).toLocaleDateString()}
              </p>
            </div>

            <Badge tone={warranty.is_active ? "good" : "neutral"}>
              {warranty.is_active ? t("plan.covered") : t("plan.lapsed")}
            </Badge>
          </div>
        )}

        {subscription && !subscription.is_active && (
          <p className="text-xs text-status-critical border-t border-line pt-3">
            {t("plan.expired.note")}
          </p>
        )}
      </div>
    </Card>
  );
}
