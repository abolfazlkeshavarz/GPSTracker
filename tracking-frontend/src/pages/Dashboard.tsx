import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDevices, getLatestLocation } from "../api/devices";
import DashboardLayout from "../components/layout/DashboardLayout";
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
                lastUpdate: location ? new Date(location.timestamp ? location.timestamp * 1000 : Date.now()) : undefined
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const { isConnected: wsConnected } = useWebSocket({
    onMessage: (data) => {
      // Update device location in real-time
      setDevices(prev => prev.map(device => {
        if (device.serial === data.device) {
          return {
            ...device,
            location: data,
            status: "online",
            lastUpdate: new Date()
          };
        }
        return device;
      }));
      
      // Update stats
      setDevices(current => {
        const onlineCount = current.filter(d => d.status === "online").length;
        setStats(prev => ({ ...prev, online: onlineCount, active: onlineCount }));
        return current;
      });
    },
  });

  const getBatteryColor = (voltage: number) => {
    if (voltage >= 12.5) return "text-green-600";
    if (voltage >= 11.8) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
          Dashboard Overview
        </h1>
        <p className="text-gray-500 mt-1">Real-time monitoring of your fleet</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Total Devices</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{stats.total}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <Cpu className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Online Devices</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{stats.online}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <Wifi className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Offline Devices</p>
              <p className="text-3xl font-bold text-gray-600 mt-1">{stats.offline}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-xl">
              <AlertCircle className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Active Today</p>
              <p className="text-3xl font-bold text-purple-600 mt-1">{stats.active}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-xl">
              <Activity className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Devices Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Your Devices</h2>
          <Link
            to="/activate"
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 flex items-center space-x-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add New Device</span>
          </Link>
        </div>

        {devices.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Cpu className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No Devices Yet</h3>
            <p className="text-gray-500 mb-6">Activate your first GPS tracker to start monitoring</p>
            <Link
              to="/activate"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Activate Device</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device) => (
              <Link
                key={device.serial}
                to={`/device/${device.serial}`}
                className="group"
              >
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        device.status === "online" 
                          ? "bg-green-100 text-green-700" 
                          : "bg-gray-100 text-gray-700"
                      }`}>
                        {device.status === "online" ? (
                          <span className="flex items-center">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse"></span>
                            Online
                          </span>
                        ) : "Offline"}
                      </div>
                      <div className="text-lg font-bold text-gray-700 truncate max-w-[150px]">
                        {device.serial}
                      </div>
                    </div>

                    {device.location ? (
                      <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 flex items-center">
                            <MapPin className="w-4 h-4 mr-1" />
                            Location
                          </span>
                          <span className="font-medium text-gray-800 text-xs">
                            {device.location.lat?.toFixed(4)}, {device.location.lng?.toFixed(4)}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                          <div>
                            <p className="text-xs text-gray-500 flex items-center">
                              <TrendingUp className="w-3 h-3 mr-1" />
                              Speed
                            </p>
                            <p className="text-lg font-semibold text-gray-800">
                              {device.location.speed} <span className="text-xs">km/h</span>
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-gray-500 flex items-center">
                              <Satellite className="w-3 h-3 mr-1" />
                              Satellites
                            </p>
                            <p className="text-lg font-semibold text-gray-800">
                              {device.location.sat || device.location.satellites}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-gray-500 flex items-center">
                              <Signal className="w-3 h-3 mr-1" />
                              Signal
                            </p>
                            <p className="text-lg font-semibold text-gray-800">
                              {device.location.csq}/31
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-gray-500 flex items-center">
                              <Battery className="w-3 h-3 mr-1" />
                              Battery
                            </p>
                            <p className={`text-lg font-semibold ${getBatteryColor(device.location.battery || 12)}`}>
                              {device.location.battery || 12}V
                            </p>
                          </div>
                        </div>
                        
                        {device.lastUpdate && (
                          <p className="text-xs text-gray-400 text-right flex items-center justify-end space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{device.lastUpdate.toLocaleTimeString()}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No data yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* WebSocket Status */}
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-600">WebSocket Connection</span>
          </div>
          <span className={`text-xs font-medium ${wsConnected ? 'text-green-600' : 'text-red-600'}`}>
            {wsConnected ? 'Live Updates Active' : 'Reconnecting...'}
          </span>
        </div>
      </div>
    </DashboardLayout>
  );
}