import { HeartPulse, PlugZap, RadioTower } from "lucide-react";

import { useLanguage } from "../../context/LanguageContext";
import { Badge, Card, CardHeader } from "../ui";
import { trackerHealth, type HealthInput } from "../../lib/health";

/*
One glanceable "is this tracker OK" score, the same formula the mobile app
uses: how fresh the last fix is, GPS quality (HDOP when the hardware reports
it, satellite count otherwise) and cell signal. A power cut or jamming flag
drags it down. Sensors the unit does not have are simply not counted, so an
older or simpler board is not marked unhealthy for lacking them.
*/

export default function HealthCard({ location, online }: { location: HealthInput | null; online: boolean }) {
  const { t } = useLanguage();
  const health = trackerHealth(location, online);
  const tone = health === "excellent" || health === "good" ? "good" : health === "fair" ? "warning" : "critical";

  return (
    <Card flush>
      <CardHeader
        title={t("health.title")}
        action={
          <Badge tone={tone} icon={<HeartPulse className="w-3 h-3" />}>
            {t(health)}
          </Badge>
        }
      />
      {(location?.ext_power === false || location?.jamming === true) && (
        <div className="px-5 pb-4 space-y-2">
          {location.ext_power === false && (
            <p className="flex items-center gap-2 text-sm font-medium text-status-critical">
              <PlugZap className="w-4 h-4" /> {t("cfg.power")}
            </p>
          )}
          {location.jamming === true && (
            <p className="flex items-center gap-2 text-sm font-medium text-status-critical">
              <RadioTower className="w-4 h-4" /> {t("cfg.jamming")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
