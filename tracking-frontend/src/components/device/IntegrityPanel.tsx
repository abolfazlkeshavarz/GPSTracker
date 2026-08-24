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
      setError(err?.response?.data?.error || "Could not verify this range.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [serial, from, to]);

  useEffect(() => {
    run();
  }, [run]);

  const covered = result ? result.record_count - result.unprotected_count : 0;
  const fullyProtected = !!result && result.valid && result.unprotected_count === 0;

  return (
    <Card flush>
      <CardHeader
        title="Record integrity"
        subtitle="Whether this history can be shown to be unaltered"
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={run}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            aria-label="Re-check integrity"
          >
            Re-check
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
            No records in this range to verify.
          </p>
        ) : (
          <>
            <Verdict
              valid={result.valid}
              fullyProtected={fullyProtected}
              covered={covered}
            />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label="Records in range" value={result.record_count} />
              <Row label="Covered by the chain" value={covered} />
              <Row
                label="Device-signed"
                value={result.hmac_count}
                hint="HMAC — provably from the device"
              />
              <Row
                label="Legacy auth"
                value={result.legacy_count}
                tone={result.legacy_count > 0 ? "warning" : undefined}
                hint="Shared secret sent in clear"
              />
              <Row
                label="Backfilled"
                value={result.backfill_count}
                hint="Recovered from a coverage gap"
              />
              <Row
                label="Not covered"
                value={result.unprotected_count}
                tone={result.unprotected_count > 0 ? "warning" : undefined}
                hint="Stored before chaining began"
              />
            </dl>

            {result.detail && (
              <p className="text-xs text-content-muted border-t border-line pt-3">
                {result.detail}
              </p>
            )}

            {!result.valid && result.first_broken_id != null && (
              <p className="text-xs text-status-critical">
                Tampering begins at record #{result.first_broken_id}. Everything
                recorded before it is still verifiable.
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
                Download certificate
              </Button>

              <a
                href="/api/certificate-key"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand hover:underline"
              >
                Public key
              </a>
            </div>

            <p className="text-xs text-content-muted">
              The certificate is signed with Ed25519 and can be checked by
              anyone holding the public key — no account here required.
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
  if (!valid) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-control bg-status-critical-bg border border-status-critical/25">
        <ShieldAlert className="w-5 h-5 text-status-critical shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-status-critical">Records were altered</p>
          <p className="text-xs text-content-secondary mt-0.5">
            The stored hashes no longer match the data. This history should not
            be relied on as evidence.
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
          <p className="font-semibold text-status-warning">Partially verifiable</p>
          <p className="text-xs text-content-secondary mt-0.5">
            {covered} record{covered === 1 ? "" : "s"} verify correctly. The rest
            were stored before tamper-evident recording was switched on, so
            nothing can be proven about them either way.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-control bg-status-good-bg border border-status-good/25">
      <ShieldCheck className="w-5 h-5 text-status-good shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-status-good">Verified unaltered</p>
        <p className="text-xs text-content-secondary mt-0.5">
          Every record hashes correctly and links to the one before it. Nothing
          has been edited, removed or reordered since it was stored.
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
  if (verified === null) return null;

  return verified ? (
    <Badge tone="good" icon={<BadgeCheck className="w-3 h-3" />}>
      Verified
    </Badge>
  ) : (
    <Badge tone="critical" icon={<ShieldAlert className="w-3 h-3" />}>
      Altered
    </Badge>
  );
}
