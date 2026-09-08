import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Download,
  FileWarning,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  SignalZero,
} from "lucide-react";

import { verifyChain, downloadCertificate, type ChainVerification } from "../../api/devices";
import { useLanguage } from "../../context/LanguageContext";
import { Badge, Button, Card, CardHeader, Skeleton, cx } from "../ui";

/*
Integrity panel.

Shows whether the stored history for a range is provably unaltered, and offers
a signed certificate for it.

The wording matters more than usual here. This panel makes an evidentiary
claim, and overstating it would be worse than not having the feature at all —
so it distinguishes three separate things that are easy to conflate:

  - the chain verified          nothing was changed after storage
  - points were HMAC-signed     the device authenticated itself
  - points predate the chain    they are simply not covered
*/

interface Props {
  serial: string;
  from: string;
  to: string;
}

export default function IntegrityPanel({ serial, from, to }: Props) {
  const { t } = useLanguage();
  const [result, setResult] = useState<ChainVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadCertificate(serial, from, to);
    } catch {
      // Best-effort convenience action; nothing left in a broken state.
    } finally {
      setDownloading(false);
    }
  };

  const run = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await verifyChain(serial, from, to);
      setResult(data.verification);
    } catch (err: any) {
      setError(err?.response?.data?.error || t("integrity.error"));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [serial, from, to, t]);

  useEffect(() => {
    run();
  }, [run]);

  const covered = result ? result.record_count - result.unprotected_count : 0;
  const fullyProtected = !!result && result.valid && result.unprotected_count === 0;

  return (
    <Card flush>
      <CardHeader
        title={t("integrity.title")}
        subtitle={t("integrity.subtitle")}
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={run}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            aria-label={t("integrity.recheck.aria")}
          >
            {t("integrity.recheck")}
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        {loading && !result ? (
          <>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </>
        ) : error ? (
          <p className="flex items-start gap-2 text-sm text-status-critical">
            <ShieldQuestion className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </p>
        ) : !result || result.record_count === 0 ? (
          <p className="flex items-start gap-2 text-sm text-content-muted">
            <SignalZero className="w-4 h-4 shrink-0 mt-0.5" />
            {t("integrity.no.records")}
          </p>
        ) : (
          <>
            <Verdict
              valid={result.valid}
              fullyProtected={fullyProtected}
              covered={covered}
            />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label={t("integrity.row.records")} value={result.record_count} />
              <Row label={t("integrity.row.covered")} value={covered} />
              <Row
                label={t("integrity.row.device.signed")}
                value={result.hmac_count}
                hint={t("integrity.hint.hmac")}
              />
              <Row
                label={t("integrity.row.legacy")}
                value={result.legacy_count}
                tone={result.legacy_count > 0 ? "warning" : undefined}
                hint={t("integrity.hint.legacy")}
              />
              <Row
                label={t("integrity.row.backfilled")}
                value={result.backfill_count}
                hint={t("integrity.hint.backfilled")}
              />
              <Row
                label={t("integrity.row.not.covered")}
                value={result.unprotected_count}
                tone={result.unprotected_count > 0 ? "warning" : undefined}
                hint={t("integrity.hint.not.covered")}
              />
            </dl>

            {result.detail && (
              <p className="text-xs text-content-muted border-t border-line pt-3">
                {result.detail}
              </p>
            )}

            {!result.valid && result.first_broken_id != null && (
              <p className="text-xs text-status-critical">
                {t("integrity.tamper.begins").replace("{id}", String(result.first_broken_id))}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleDownload}
                loading={downloading}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                {t("integrity.download")}
              </Button>

              <a
                href="/api/certificate-key"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand hover:underline"
              >
                {t("integrity.public.key")}
              </a>
            </div>

            <p className="text-xs text-content-muted">
              {t("integrity.cert.note")}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Verdict({
  valid,
  fullyProtected,
  covered,
}: {
  valid: boolean;
  fullyProtected: boolean;
  covered: number;
}) {
  const { t } = useLanguage();

  if (!valid) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-control bg-status-critical-bg border border-status-critical/25">
        <ShieldAlert className="w-5 h-5 text-status-critical shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-status-critical">{t("integrity.verdict.altered.title")}</p>
          <p className="text-xs text-content-secondary mt-0.5">
            {t("integrity.verdict.altered.body")}
          </p>
        </div>
      </div>
    );
  }

  if (!fullyProtected) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-control bg-status-warning-bg border border-status-warning/25">
        <FileWarning className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-status-warning">{t("integrity.verdict.partial.title")}</p>
          <p className="text-xs text-content-secondary mt-0.5">
            {t("integrity.verdict.partial.body").replace("{covered}", String(covered))}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-control bg-status-good-bg border border-status-good/25">
      <ShieldCheck className="w-5 h-5 text-status-good shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-status-good">{t("integrity.verdict.ok.title")}</p>
        <p className="text-xs text-content-secondary mt-0.5">
          {t("integrity.verdict.ok.body")}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-content-muted truncate">{label}</dt>
      <dd
        className={cx(
          "font-semibold tnum",
          tone === "warning" ? "text-status-warning" : "text-content"
        )}
      >
        {value}
      </dd>
      {hint && <p className="text-[11px] text-content-muted truncate">{hint}</p>}
    </div>
  );
}

/** Compact badge for page headers. */
export function IntegrityBadge({ verified }: { verified: boolean | null }) {
  const { t } = useLanguage();

  if (verified === null) return null;

  return verified ? (
    <Badge tone="good" icon={<BadgeCheck className="w-3 h-3" />}>
      {t("integrity.badge.verified")}
    </Badge>
  ) : (
    <Badge tone="critical" icon={<ShieldAlert className="w-3 h-3" />}>
      {t("integrity.badge.altered")}
    </Badge>
  );
}
