import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell, BellRing, Send, Smartphone } from "lucide-react";

import { sendTestPush } from "../../api/push";
import { disablePush, enablePush, getPushState, type PushState } from "../../lib/push";
import { isIOS, isStandalone } from "../../lib/pwa";
import { useLanguage } from "../../context/LanguageContext";
import { Button, Card, CardHeader, Skeleton } from "../ui";

/*
Notification enrolment.

Deliberately explicit rather than automatic. Asking for notification
permission on page load is how an app gets permanently blocked in Chrome and
Safari, and a blocked origin cannot ask again — which would silently remove
the only channel that reaches someone whose phone is in their pocket.

So: a switch, an explanation of what it is for, and a test button, because
"are notifications actually working?" should be answerable before 3am rather
than during it.
*/

export default function NotificationSettings() {
  const { t } = useLanguage();

  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    setState(await getPushState());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = async () => {
    setBusy(true);
    try {
      const next = state === "on" ? await disablePush() : await enablePush();
      setState(next);

      if (next === "on") toast.success(t("notify.enabled"));
      else if (next === "denied") toast.error(t("notify.denied.toast"), { duration: 6000 });
    } catch {
      toast.error(t("notify.failed"));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await sendTestPush();
      toast.success(t("notify.test.sent"));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t("notify.failed");
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  if (state === null) {
    return (
      <Card flush>
        <CardHeader title={t("notify.title")} subtitle={t("notify.subtitle")} />
        <div className="p-5">
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    );
  }

  // iOS grants push only to an installed app. Telling someone to "allow
  // notifications" in Safari when the API is not there at all sends them
  // hunting through settings that cannot fix it.
  const iosNeedsInstall = isIOS() && !isStandalone();

  return (
    <Card flush>
      <CardHeader title={t("notify.title")} subtitle={t("notify.subtitle")} />

      <div className="p-5 space-y-4">
        {state === "unsupported" && (
          <Message icon={<Bell className="w-4 h-4" />} text={t("notify.unsupported")} />
        )}

        {state === "unconfigured" && (
          <Message icon={<Bell className="w-4 h-4" />} text={t("notify.unconfigured")} />
        )}

        {state === "denied" && (
          <Message icon={<Bell className="w-4 h-4" />} text={t("notify.denied")} tone="critical" />
        )}

        {iosNeedsInstall && state !== "unsupported" && (
          <Message icon={<Smartphone className="w-4 h-4" />} text={t("notify.ios.install")} tone="warning" />
        )}

        {(state === "on" || state === "off") && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-content">
                  {state === "on" ? t("notify.on") : t("notify.off")}
                </p>
                <p className="text-xs text-content-muted mt-0.5">{t("notify.what")}</p>
              </div>

              <Button
                variant={state === "on" ? "secondary" : "primary"}
                size="sm"
                loading={busy}
                onClick={toggle}
                icon={<BellRing className="w-3.5 h-3.5" />}
              >
                {state === "on" ? t("notify.disable") : t("notify.enable")}
              </Button>
            </div>

            {state === "on" && (
              <div className="border-t border-line pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={testing}
                  onClick={test}
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  {t("notify.test")}
                </Button>
                <p className="text-xs text-content-muted mt-1.5">{t("notify.test.hint")}</p>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Message({
  icon,
  text,
  tone = "muted",
}: {
  icon: React.ReactNode;
  text: string;
  tone?: "muted" | "warning" | "critical";
}) {
  const classes = {
    muted: "text-content-muted",
    warning: "text-status-warning",
    critical: "text-status-critical",
  }[tone];

  return (
    <p className={`flex items-start gap-2 text-xs ${classes}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      {text}
    </p>
  );
}
