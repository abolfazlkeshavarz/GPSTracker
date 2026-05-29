import { useEffect, useState } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useLanguage } from "../context/LanguageContext";
import api from "../api/axios";
import { Shield, Plus, Edit, Trash2, Users, Activity, Eye } from "lucide-react";

interface Device {
  serial: string;
  device_secret: string;
  user_id?: number;
  user_phone?: string;
  is_active: boolean;
  activated_at?: string;
  created_at: string;
}

interface User {
  id: number;
  phone: string;
  role: string;
  created_at: string;
}

interface AuditLog {
  id: number;
  user_id?: number;
  user_phone?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address: string;
  created_at: string;
}

export default function AdminPanel() {
  const { t, isRTL } = useLanguage();
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<any>({});
  const [activeTab, setActiveTab] = useState("devices");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDevice, setNewDevice] = useState({ serial: "", device_secret: "" });

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      if (activeTab === "devices") {
        const response = await api.get("/admin/devices");
        setDevices(response.data.devices);
      } else if (activeTab === "users") {
        const response = await api.get("/admin/users");
        setUsers(response.data.users);
      } else if (activeTab === "logs") {
        const response = await api.get("/admin/logs");
        setLogs(response.data.logs);
      }
      
      // Load stats for all tabs
      const statsRes = await api.get("/admin/stats");
      setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  };

  const handleCreateDevice = async () => {
    try {
      await api.post("/admin/devices", newDevice);
      setShowCreateModal(false);
      setNewDevice({ serial: "", device_secret: "" });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to create device");
    }
  };

  const handleDeleteDevice = async (serial: string) => {
    if (confirm("Are you sure you want to delete this device?")) {
      try {
        await api.delete(`/admin/devices/${serial}`);
        loadData();
      } catch (err) {
        alert("Failed to delete device");
      }
    }
  };

  return (
    <DashboardLayout>
      <div className={`max-w-7xl mx-auto ${isRTL ? "text-right" : ""}`}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Admin Panel
          </h1>
          <p className="text-gray-500 mt-1">Manage devices, users, and view system logs</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Devices</p>
                <p className="text-3xl font-bold text-gray-800">{stats.total_devices || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-xl">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Active Devices</p>
                <p className="text-3xl font-bold text-green-600">{stats.active_devices || 0}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-xl">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Users</p>
                <p className="text-3xl font-bold text-gray-800">{stats.total_users || 0}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-xl">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Inactive Devices</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.inactive_devices || 0}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-xl">
                <Activity className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {[
                { id: "devices", label: "Devices", icon: Activity },
                { id: "users", label: "Users", icon: Users },
                { id: "logs", label: "Audit Logs", icon: Eye },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all ${
                    activeTab === tab.id
                      ? "border-purple-600 text-purple-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Devices Tab */}
            {activeTab === "devices" && (
              <div>
                <div className="flex justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-800">All Devices</h2>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add Device
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Serial</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Secret</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">User</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Created</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {devices.map((device) => (
                        <tr key={device.serial} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-sm">{device.serial}</td>
                          <td className="px-4 py-3 font-mono text-sm">{device.device_secret}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              device.is_active 
                                ? "bg-green-100 text-green-700" 
                                : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {device.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {device.user_phone || "Not assigned"}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {new Date(device.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleDeleteDevice(device.serial)}
                              className="text-red-600 hover:text-red-800 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === "users" && (
              <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-6">All Users</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">ID</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Phone</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Role</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{user.id}</td>
                          <td className="px-4 py-3 text-sm font-mono">{user.phone}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              user.role === "admin" 
                                ? "bg-purple-100 text-purple-700" 
                                : "bg-gray-100 text-gray-700"
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === "logs" && (
              <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Audit Logs</h2>
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-500">#{log.id}</span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {log.action}
                          </span>
                          <span className="text-sm text-gray-600">
                            {log.entity_type}: {log.entity_id}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        User: {log.user_phone || "System"} | IP: {log.ip_address}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Device Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">Add New Device</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={newDevice.serial}
                  onChange={(e) => setNewDevice({ ...newDevice, serial: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g., DEVICE001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Secret
                </label>
                <input
                  type="text"
                  value={newDevice.device_secret}
                  onChange={(e) => setNewDevice({ ...newDevice, device_secret: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter secret key"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCreateDevice}
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}