import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getLatestLocation } from "../api/devices";
import LiveMap from "../components/map/LiveMap";
import { useWebSocket } from "../hooks/useWebSocket";
import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import { useLanguage } from "../context/LanguageContext";
import { 
  Gauge, 
  Satellite, 
  Signal, 
  Battery, 
  Activity,
  MapPin,
  Clock,
  Wifi,
  Cpu,
  TrendingUp,
  Zap,
  AlertCircle,
  CheckCircle,
  History
} from "lucide-react";

export default function DeviceDetails() {
  const { serial } = useParams();
  const { t, isRTL } = useLanguage();
  const [location, setLocation] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocation();
  }, [serial]);

  const loadLocation = async () => {
    if (!serial) return;
    try {
      setLoading(true);
      const data = await getLatestLocation(serial);
      setLocation(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const { isConnected: wsConnected } = useWebSocket({
    onMessage: (data) => {
      if (data.device === serial) {
        setLocation(data);
        setLastUpdate(new Date());
      }
    },
  });

  const getBatteryStatus = (voltage: number) => {
    if (voltage >= 12.5) return { text: t('excellent'), color: "text-green-600", bg: "bg-green-100", percentage: 100 };
    if (voltage >= 12.2) return { text: t('good'), color: "text-green-500", bg: "bg-green-50", percentage: 80 };
    if (voltage >= 11.8) return { text: t('fair'), color: "text-yellow-600", bg: "bg-yellow-100", percentage: 60 };
    if (voltage >= 11.5) return { text: t('low'), color: "text-orange-600", bg: "bg-orange-100", percentage: 40 };
    return { text: t('critical'), color: "text-red-600", bg: "bg-red-100", percentage: 20 };
  };

  const getSignalStrength = (csq: number) => {
    if (csq >= 20) return { text: t('excellent'), color: "text-green-600", bars: 5 };
    if (csq >= 15) return { text: t('good'), color: "text-green-500", bars: 4 };
    if (csq >= 10) return { text: t('fair'), color: "text-yellow-600", bars: 3 };
    if (csq >= 5) return { text: t('poor'), color: "text-orange-600", bars: 2 };
    return { text: t('very.poor'), color: "text-red-600", bars: 1 };
  };

  const getSatelliteStatus = (satellites: number) => {
    if (satellites >= 8) return { text: t('excellent'), color: "text-green-600", percentage: 100 };
    if (satellites >= 6) return { text: t('good'), color: "text-green-500", percentage: 75 };
    if (satellites >= 4) return { text: t('fair'), color: "text-yellow-600", percentage: 50 };
    if (satellites >= 2) return { text: t('poor'), color: "text-orange-600", percentage: 25 };
    return { text: t('no.fix'), color: "text-red-600", percentage: 0 };
  };

  if (loading) {
    return (
      <ResponsiveLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">{t('loading')}</p>
          </div>
        </div>
      </ResponsiveLayout>
    );
  }

  if (!location) {
    return (
      <ResponsiveLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">{t('no.data.available')}</h2>
            <p className="text-gray-500">{t('no.location.data')} {serial}</p>
          </div>
        </div>
      </ResponsiveLayout>
    );
  }

  const batteryStatus = getBatteryStatus(location.battery || 12);
  const signalStrength = getSignalStrength(location.csq || 0);
  const satelliteStatus = getSatelliteStatus(location.sat || location.satellites || 0);

  return (
    <ResponsiveLayout>
      {/* Header */}
      <div className={`mb-8 ${isRTL ? 'text-right' : ''}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {t('device.details')}
            </h1>
            <p className="text-gray-500 mt-1 font-mono">{t('serial')}: {serial}</p>
          </div>
          <div className={`flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-4'}`}>
            <Link
              to={`/device/${serial}/history`}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <History className="w-4 h-4" />
              {t('view.history')}
            </Link>
            <div className={`flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-2'} px-3 py-2 bg-gray-100 rounded-lg`}>
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
              <span className="text-sm text-gray-600">
                {wsConnected ? t('live.updates') : t('connecting')}
              </span>
            </div>
            <div className={`flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-2'} text-sm text-gray-500 px-3 py-2 bg-gray-100 rounded-lg`}>
              <Clock className="w-4 h-4" />
              <span>{t('last.update')}: {lastUpdate.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Speed Card */}
        <div className="group relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className={`relative p-6 ${isRTL ? 'text-right' : ''}`}>
            <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="p-3 bg-blue-100 rounded-xl">
                <Gauge className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">{t('real.time')}</span>
            </div>
            <p className="text-gray-500 text-sm font-medium mb-1">{t('speed')}</p>
            <p className="text-4xl font-bold text-gray-800">
              {location.speed || 0}
              <span className="text-lg font-medium text-gray-500 mr-1">{t('speed.unit')}</span>
            </p>
            <div className={`mt-2 flex items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
              <TrendingUp className={`w-4 h-4 text-gray-400 ${isRTL ? 'ml-1' : 'mr-1'}`} />
              <span className="text-xs text-gray-400">{t('speed.realtime')}</span>
            </div>
          </div>
        </div>

        {/* Satellites Card */}
        <div className="group relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500 opacity-10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className={`relative p-6 ${isRTL ? 'text-right' : ''}`}>
            <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="p-3 bg-purple-100 rounded-xl">
                <Satellite className="w-6 h-6 text-purple-600" />
              </div>
              <span className={`text-xs font-semibold ${satelliteStatus.color} bg-purple-100 px-2 py-1 rounded-full`}>
                {satelliteStatus.text}
              </span>
            </div>
            <p className="text-gray-500 text-sm font-medium mb-1">{t('satellites')}</p>
            <p className="text-4xl font-bold text-gray-800">
              {location.sat || location.satellites || 0}
              <span className="text-lg font-medium text-gray-500 mr-1">{t('satellites.in.view')}</span>
            </p>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-purple-600 h-2 rounded-full transition-all duration-300" 
                     style={{ width: `${satelliteStatus.percentage}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Signal Card */}
        {/* Signal Card */}
        <div className="group relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500 opacity-10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className={`relative p-6 ${isRTL ? 'text-right' : ''}`}>
            <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="p-3 bg-green-100 rounded-xl">
                <Signal className="w-6 h-6 text-green-600" />
              </div>
              <span className={`text-xs font-semibold ${signalStrength.color} bg-green-100 px-2 py-1 rounded-full`}>
                {signalStrength.text}
              </span>
            </div>
            <p className="text-gray-500 text-sm font-medium mb-1">{t('signal.strength')}</p>
            <p className="text-4xl font-bold text-gray-800">
              <span className={signalStrength.color}>{location.csq || 0}</span>
              <span className="text-lg font-medium text-gray-500 mr-1">/31</span>
            </p>
            <div className={`mt-2 flex items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Wifi className={`w-4 h-4 text-gray-400 ${isRTL ? 'ml-1' : 'mr-1'}`} />
              {/* Signal bars with fixed spacing - WORKS IN BOTH LTR AND RTL */}
              <div className="flex">
                <div className={`w-2 h-4 rounded-sm ${signalStrength.bars >= 1 ? 'bg-green-500' : 'bg-gray-200'}`} style={{ marginRight: '4px' }}></div>
                <div className={`w-2 h-4 rounded-sm ${signalStrength.bars >= 2 ? 'bg-green-500' : 'bg-gray-200'}`} style={{ marginRight: '4px' }}></div>
                <div className={`w-2 h-4 rounded-sm ${signalStrength.bars >= 3 ? 'bg-green-500' : 'bg-gray-200'}`} style={{ marginRight: '4px' }}></div>
                <div className={`w-2 h-4 rounded-sm ${signalStrength.bars >= 4 ? 'bg-green-500' : 'bg-gray-200'}`} style={{ marginRight: '4px' }}></div>
                <div className={`w-2 h-4 rounded-sm ${signalStrength.bars >= 5 ? 'bg-green-500' : 'bg-gray-200'}`} style={{ marginRight: '4px' }}></div>
              </div>
            </div>
          </div>
        </div>
        {/* Battery Card */}
        <div className="group relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 opacity-10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className={`relative p-6 ${isRTL ? 'text-right' : ''}`}>
            <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="p-3 bg-orange-100 rounded-xl">
                <Battery className="w-6 h-6 text-orange-600" />
              </div>
              <span className={`text-xs font-semibold ${batteryStatus.color} ${batteryStatus.bg} px-2 py-1 rounded-full`}>
                {batteryStatus.text}
              </span>
            </div>
            <p className="text-gray-500 text-sm font-medium mb-1">{t('battery')}</p>
            <p className="text-4xl font-bold text-gray-800">
              <span className={batteryStatus.color}>{location.battery || 12}</span>
              <span className="text-lg font-medium text-gray-500 mr-1">{t('battery.voltage')}</span>
            </p>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className={`${batteryStatus.color.replace('text', 'bg')} h-2 rounded-full transition-all duration-300`} 
                     style={{ width: `${batteryStatus.percentage}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className={`flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-3'} mb-4`}>
            <MapPin className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-800">{t('location.details')}</h3>
          </div>
          <div className="space-y-3">
            <div className={`key-value-pair flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} items-center py-2 border-b border-gray-100`}>
              <span className="key text-gray-600">{t('latitude')}</span>
              <span className="value font-mono text-sm font-medium text-gray-800">{location.lat?.toFixed(6)}°</span>
            </div>
            <div className={`key-value-pair flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} items-center py-2 border-b border-gray-100`}>
              <span className="key text-gray-600">{t('longitude')}</span>
              <span className="value font-mono text-sm font-medium text-gray-800">{location.lng?.toFixed(6)}°</span>
            </div>
            {location.operator && (
              <div className={`key-value-pair flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} items-center py-2 border-b border-gray-100`}>
                <span className="key text-gray-600">{t('network.operator')}</span>
                <span className="value text-sm font-medium text-gray-800">{location.operator}</span>
              </div>
            )}
            {location.ignition !== undefined && (
              <div className={`key-value-pair flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} items-center py-2`}>
                <span className="key text-gray-600">{t('ignition')}</span>
                <span className={`value text-sm font-medium ${location.ignition ? 'text-green-600' : 'text-gray-500'}`}>
                  {location.ignition ? (
                    <span className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <Zap className={`w-4 h-4 ${isRTL ? 'ml-1' : 'mr-1'}`} />
                      ON
                    </span>
                  ) : 'OFF'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className={`flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-3'} mb-4`}>
            <Activity className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-800">{t('performance.metrics')}</h3>
          </div>
          <div className="space-y-3">
            <div className={`key-value-pair flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} items-center py-2 border-b border-gray-100`}>
              <span className="key text-gray-600">{t('gps.accuracy')}</span>
              <div className="value flex items-center">
                <div className={`w-2 h-2 rounded-full ${isRTL ? 'ml-2' : 'mr-2'} ${(location.sat || location.satellites || 0) >= 8 ? 'bg-green-500' : (location.sat || location.satellites || 0) >= 4 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                <span className="text-sm font-medium">
                  {(location.sat || location.satellites || 0) >= 8 ? t('high') : (location.sat || location.satellites || 0) >= 4 ? t('medium') : t('low')}
                </span>
              </div>
            </div>
            <div className={`key-value-pair flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} items-center py-2 border-b border-gray-100`}>
              <span className="key text-gray-600">{t('data.quality')}</span>
              <span className="value text-sm font-medium text-green-600 flex items-center">
                <CheckCircle className={`w-4 h-4 ${isRTL ? 'ml-1' : 'mr-1'}`} />
                {t('excellent')}
              </span>
            </div>
            <div className={`key-value-pair flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} items-center py-2`}>
              <span className="key text-gray-600">{t('update.frequency')}</span>
              <span className="value text-sm font-medium text-gray-800 flex items-center">
                <Activity className={`w-4 h-4 ${isRTL ? 'ml-1' : 'mr-1'} text-green-500`} />
                {t('real.time')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Map Section */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
          <div className={`flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-2'}`}>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <h2 className="text-lg font-semibold text-gray-800">{t('live.location.tracking')}</h2>
            <span className={`text-xs text-gray-500 ${isRTL ? 'mr-auto' : 'ml-auto'}`}>
              {t('last.known.position')}
            </span>
          </div>
        </div>
        <div className="h-[500px]">
          <LiveMap lat={location.lat} lng={location.lng} serial={serial || ""} />
        </div>
      </div>
    </ResponsiveLayout>
  );
}