import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Phone, Shield, UserCircle } from "lucide-react";

import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import { useLanguage } from "../context/LanguageContext";
import { getMe, changeMyPassword } from "../api/account";
import { Badge, Button, Card, CardHeader, Input, PageHeading, Skeleton } from "../components/ui";
import NotificationSettings from "../components/pwa/NotificationSettings";

export default function Account() {
  const { t } = useLanguage();
  const [me, setMe] = useState<{ id: number; phone: string; role: string; created_at: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ResponsiveLayout>
      <PageHeading title={t("account")} subtitle={t("account.subtitle")} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 max-w-3xl">
        <Card flush>
          <CardHeader title={t("profile")} />
          <div className="p-5 space-y-4">
            {loading ? (
              <>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </>
            ) : me ? (
              <>
                <ProfileRow icon={<Phone className="w-4 h-4" />} label={t("phone")} value={me.phone} />
                <ProfileRow
                  icon={<Shield className="w-4 h-4" />}
                  label={t("role")}
                  value={<Badge tone={me.role === "admin" ? "brand" : "neutral"} className="capitalize">{me.role}</Badge>}
                />
                <ProfileRow
                  icon={<UserCircle className="w-4 h-4" />}
                  label={t("member.since")}
                  value={new Date(me.created_at).toLocaleDateString()}
                />
              </>
            ) : (
              <p className="text-sm text-content-muted">—</p>
            )}
          </div>
        </Card>

        <ChangePasswordCard t={t} />

        {/* Push enrolment. Spans both columns: it is the setting that decides
            whether the theft alerts reach anyone, so it should not read as a
            footnote next to the password form. */}
        <div className="lg:col-span-2">
          <NotificationSettings />
        </div>
      </div>
    </ResponsiveLayout>
  );
}

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-content-muted">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium text-content">{value}</span>
    </div>
  );
}

function ChangePasswordCard({ t }: { t: (k: string) => string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (next.length < 6) {
      setError(t("password.too.short"));
      return;
    }
    if (next !== confirm) {
      setError(t("passwords.dont.match"));
      return;
    }

    setSubmitting(true);
    try {
      await changeMyPassword(current, next);
      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err: any) {
      setError(err?.response?.data?.error || t("login.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card flush>
      <CardHeader title={t("change.password")} />
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <Input
          type="password"
          label={t("current.password")}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          leadingIcon={<KeyRound className="w-4 h-4" />}
          autoComplete="current-password"
          required
        />
        <Input
          type="password"
          label={t("new.password")}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          leadingIcon={<KeyRound className="w-4 h-4" />}
          autoComplete="new-password"
          minLength={6}
          required
        />
        <Input
          type="password"
          label={t("confirm.new.password")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          leadingIcon={<KeyRound className="w-4 h-4" />}
          autoComplete="new-password"
          minLength={6}
          required
        />

        {error && <p className="text-xs text-status-critical">{error}</p>}
        {success && (
          <p className="flex items-center gap-1.5 text-xs text-status-good">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t("password.updated")}
          </p>
        )}

        <Button type="submit" loading={submitting} fullWidth>
          {t("update.password")}
        </Button>
      </form>
    </Card>
  );
}
