import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDevices, getLatestLocation } from "../api/devices";
import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import { useLanguage } from "../context/LanguageContext";
import {
  MapPin,
  Battery,
  Signal,
  Activity,
  Cpu,
  Wifi,
  AlertCircle,
  PlusCircle,
  Satellite,
  Clock,
  TrendingUp
} from "lucide-react";
import { useWebSocket } from "../hooks/useWebSocket";

interface DeviceWithStatus {
  serial: string;
  activated_at: string;
  location?: any;
  status: "online" | "offline" | "inactive";
  lastUpdate?: Date;
}

export default function Dashboard() {
  const { t, isRTL } = useLanguage();
  const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    active: 0
  });

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const data = await getDevices();
      if (data && Array.isArray(data.devices)) {
        const devicesWithStatus = await Promise.all(
          data.devices.map(async (device: any) => {
            try {
              const location = await getLatestLocation(device.serial);
              return {
                ...device,
                location,
                status: location ? "online" : "inactive",
                lastUpdate: location
                  ? new Date(location.timestamp ? location.timestamp * 1000 : Date.now())
                  : undefined
              };
            } catch {
              return {
                ...device,
                status: "inactive",
                location: null
              };
            }
          })
        );

        setDevices(devicesWithStatus);

        const onlineCount = devicesWithStatus.filter(d => d.status === "online").length;
        const offlineCount = devicesWithStatus.filter(d => d.status === "inactive").length;

        setStats({
          total: devicesWithStatus.length,
          online: onlineCount,
          offline: offlineCount,
          active: onlineCount
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const { isConnected: wsConnected } = useWebSocket({
    onMessage: (data) => {
      setDevices(prev =>
        prev.map(device =>
          device.serial === data.device
            ? { ...device, location: data, status: "online", lastUpdate: new Date() }
            : device
        )
      );

      setDevices(current => {
        const onlineCount = current.filter(d => d.status === "online").length;
        setStats(prev => ({ ...prev, online: onlineCount, active: onlineCount }));
        return current;
      });
    }
  });

  const getBatteryColor = (voltage: number) => {
    if (voltage >= 12.5) return "text-green-600";
    if (voltage >= 11.8) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <ResponsiveLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">{t("loading")}</p>
          </div>
        </div>
      </ResponsiveLayout>
    );
  }

  return (
    <ResponsiveLayout>
      {/* Header */}
      <div className={`mb-8 ${isRTL ? "text-right" : ""}`}>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
          {t("dashboard.overview")}
        </h1>
        <p className="text-gray-500 mt-1">{t("real.time.monitoring")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">

        {[
          { label: t("total.devices"), value: stats.total, icon: Cpu, color: "text-blue-600", bg: "bg-blue-100" },
          { label: t("online.devices"), value: stats.online, icon: Wifi, color: "text-green-600", bg: "bg-green-100" },
          { label: t("offline.devices"), value: stats.offline, icon: AlertCircle, color: "text-gray-600", bg: "bg-gray-100" },
          { label: t("active.today"), value: stats.active, icon: Activity, color: "text-purple-600", bg: "bg-purple-100" }
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center justify-between">
              <div className={isRTL ? "text-right" : ""}>
                <p className="text-gray-500 text-sm">{item.label}</p>
                <p className={`text-3xl font-bold mt-1 ${item.color}`}>{item.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${item.bg}`}>
                <item.icon className={`w-6 h-6 ${item.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Devices */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">{t("your.devices")}</h2>

          <Link
            to="/activate"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t("add.new.device")}</span>
          </Link>
        </div>

        {devices.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <Cpu className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">{t("no.devices.yet")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {devices.map(device => (
              <Link key={device.serial} to={`/device/${device.serial}`}>
                <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-2xl transition">

                  {/* header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-xs px-3 py-1 rounded-full ${
                      device.status === "online"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {device.status}
                    </span>

                    <span className="font-bold text-gray-700">
                      {device.serial}
                    </span>
                  </div>

                  {/* data */}
                  {device.location ? (
                    <div className="space-y-3">

                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-500">
                          <MapPin className="w-4 h-4" />
                          {t("location")}
                        </div>
                        <span className="text-xs">
                          {device.location.lat?.toFixed(4)}, {device.location.lng?.toFixed(4)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">

                        <div>
                          <div className="flex items-center gap-1 text-gray-500">
                            <TrendingUp className="w-3 h-3" />
                            {t("speed")}
                          </div>
                          <p className="font-semibold">{device.location.speed}</p>
                        </div>

                        <div>
                          <div className="flex items-center gap-1 text-gray-500">
                            <Satellite className="w-3 h-3" />
                            {t("satellites")}
                          </div>
                          <p className="font-semibold">{device.location.sat}</p>
                        </div>

                        <div>
                          <div className="flex items-center gap-1 text-gray-500">
                            <Signal className="w-3 h-3" />
                            {t("signal")}
                          </div>
                          <p className="font-semibold">{device.location.csq}/31</p>
                        </div>

                        <div>
                          <div className="flex items-center gap-1 text-gray-500">
                            <Battery className="w-3 h-3" />
                            {t("battery")}
                          </div>
                          <p className={getBatteryColor(device.location.battery || 12)}>
                            {device.location.battery || 12}V
                          </p>
                        </div>
                      </div>

                      {device.lastUpdate && (
                        <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          {device.lastUpdate.toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-gray-400 py-6">
                      {t("no.data.yet")}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* WS status */}
      <div className="bg-white rounded-2xl shadow-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm text-gray-600">{t("websocket.connection")}</span>
        </div>

        <span className={`text-xs ${wsConnected ? "text-green-600" : "text-red-600"}`}>
          {wsConnected ? t("live.updates.active") : t("reconnecting")}
        </span>
      </div>
    </ResponsiveLayout>
  );
}