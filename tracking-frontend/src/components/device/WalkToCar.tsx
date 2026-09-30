import { useEffect, useState } from "react";
import { Footprints, Navigation } from "lucide-react";

import { useLanguage } from "../../context/LanguageContext";
import { Button, Card, CardHeader } from "../ui";

/*
Walk to my car: live distance and bearing from this phone or laptop to the
vehicle, using the browser's geolocation. Off until asked for, so the page
never prompts for location on its own.
*/

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export default function WalkToCar({ lat, lng }: { lat: number; lng: number }) {
  const { t, language } = useLanguage();
  const [active, setActive] = useState(false);
  const [me, setMe] = useState<GeolocationCoordinates | null>(null);
  const [denied, setDenied] = useState(false);
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  useEffect(() => {
    if (!active || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setMe(p.coords);
        setDenied(false);
      },
      () => setDenied(true),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, supported]);

  const dist = me ? haversineM(me.latitude, me.longitude, lat, lng) : null;
  const bearing = me ? bearingDeg(me.latitude, me.longitude, lat, lng) : 0;
  const nf = new Intl.NumberFormat(language === "fa" ? "fa-IR" : language, { maximumFractionDigits: 1 });
  const distLabel =
    dist == null ? "" : dist < 1000 ? `${nf.format(Math.round(dist))} ${t("meters")}` : `${nf.format(dist / 1000)} ${t("unit.km")}`;

  return (
    <Card flush>
      <CardHeader
        title={t("walk.title")}
        action={
          <Button
            size="sm"
            variant={active ? "secondary" : "subtle"}
            onClick={() => setActive((a) => !a)}
            icon={<Footprints className="w-3.5 h-3.5" />}
          >
            {active ? t("cancel") : t("walk.title")}
          </Button>
        }
      />
      {active && (
        <div className="px-5 pb-5 flex items-center gap-4">
          {denied || !supported ? (
            <p className="text-sm text-status-warning">{t("walk.denied")}</p>
          ) : dist == null ? (
            <p className="text-sm text-content-muted">{t("walk.locating")}</p>
          ) : (
            <>
              <span className="grid place-items-center w-14 h-14 rounded-full bg-brand text-white shrink-0">
                <Navigation className="w-7 h-7" style={{ transform: `rotate(${bearing}deg)` }} />
              </span>
              <p className="text-2xl font-semibold text-content tnum">{t("walk.away").replace("{d}", distLabel)}</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
