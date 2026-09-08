import { useEffect, useState } from "react";
import { Calendar, ShieldCheck } from "lucide-react";

import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import IntegrityPanel from "../components/device/IntegrityPanel";
import { getDevices } from "../api/devices";
import { useLanguage } from "../context/LanguageContext";
import { Card, EmptyState, PageHeading, Skeleton } from "../components/ui";

/** Local YYYY-MM-DD; toISOString() would shift the date across timezones. */
const toDateInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
};

interface DeviceRow {
  serial: string;
  name?: string;
}

/**
 * Standalone record-integrity check.
 *
 * The same panel that appears on a device's history page, but reachable on its
 * own from the sidebar: pick any device and range and verify that its stored
 * history has not been altered.
 */
export default function RecordIntegrity() {
  const { t, isRTL } = useLanguage();

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [serial, setSerial] = useState("");
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(toDateInput(new Date()));

  useEffect(() => {
    getDevices()
      .then((data) => {
        const rows: DeviceRow[] = data?.devices ?? [];
        setDevices(rows);
        setSerial((cur) => cur || rows[0]?.serial || "");
      })
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false));
  }, []);

  const rangeValid = from <= to;

  return (
    <ResponsiveLayout>
      <div className={isRTL ? "text-right" : ""}>
        <PageHeading title={t("integrity.title")} subtitle={t("integrity.page.subtitle")} />

        {loadingDevices ? (
          <Skeleton className="h-40 rounded-card" />
        ) : devices.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ShieldCheck className="w-6 h-6" />}
              title={t("integrity.no.devices")}
              description={t("integrity.pick.device")}
            />
          </Card>
        ) : (
          <>
            <div className="bg-surface rounded-card shadow-sm p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    {t("integrity.select.device")}
                  </label>
                  <select
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded-control bg-surface text-content focus:border-brand"
                  >
                    {devices.map((d) => (
                      <option key={d.serial} value={d.serial}>
                        {d.name?.trim() ? `${d.name} · ${d.serial}` : d.serial}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    <Calendar className="w-4 h-4 inline me-1" />
                    {t("history.from")}
                  </label>
                  <input
                    type="date"
                    value={from}
                    max={to}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded-control bg-surface text-content focus:border-brand"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    <Calendar className="w-4 h-4 inline me-1" />
                    {t("history.to")}
                  </label>
                  <input
                    type="date"
                    value={to}
                    min={from}
                    max={toDateInput(new Date())}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded-control bg-surface text-content focus:border-brand"
                  />
                </div>
              </div>

              {!rangeValid && (
                <p className="text-xs text-status-critical mt-3">{t("history.error.date.range")}</p>
              )}
            </div>

            <div className="max-w-xl">
              {serial && rangeValid && (
                <IntegrityPanel serial={serial} from={from} to={to} />
              )}
            </div>
          </>
        )}
      </div>
    </ResponsiveLayout>
  );
}
