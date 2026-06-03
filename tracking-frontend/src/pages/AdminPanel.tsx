import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import { useLanguage } from "../context/LanguageContext";
import api from "../api/axios";
import UserModal from "../components/admin/UserModal";
import UserDevicesModal from "../components/admin/UserDevicesModal";
import DeviceModal from "../components/admin/DeviceModal";
import { 
  Shield, Users, Smartphone, Eye, Search, 
  Edit, Trash2, Plus, Power, RefreshCw,
  Activity, Calendar, ChevronLeft, ChevronRight,
  UserPlus, X
} from "lucide-react";

export default function AdminPanel() {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [activeTab, setActiveTab] = useState("users");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [showDevicesModal, setShowDevicesModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;
  
  // State for assign device modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Load data function
  const loadData = async (page = currentPage, search = searchTerm) => {
    setLoading(true);

    try {
      if (activeTab === "users") {
        const params: any = {
          limit: itemsPerPage,
          offset: (page - 1) * itemsPerPage,
        };

        if (search && search.trim() !== "") {
          params.search = search.trim();
        }

        const response = await api.get("/admin/users", { params });
        setUsers(response.data.users || []);
        setTotalItems(response.data.total || 0);

      } else if (activeTab === "devices") {
        const params: any = {
          limit: itemsPerPage,
          offset: (page - 1) * itemsPerPage,
        };

        if (search && search.trim() !== "") {
          params.search = search.trim();
        }

        const response = await api.get("/admin/devices", { params });
        setDevices(response.data.devices || []);
        setTotalItems(response.data.total || 0);

      } else if (activeTab === "logs") {
        const response = await api.get("/admin/logs", {
          params: { limit: 50 },
        });
        setLogs(response.data.logs || []);
      }

      // Load stats
      if (activeTab === "users" || activeTab === "devices") {
        const statsRes = await api.get("/admin/stats");
        setStats(statsRes.data);
      }

    } catch (err) {
      console.error("Failed to load data:", err);
      alert("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  // Load users for assignment modal
  const loadUsersForAssignment = async () => {
    try {
      const response = await api.get("/admin/users", { params: { limit: 100 } });
      setAvailableUsers(response.data.users || []);
    } catch (err) {
      console.error("Failed to load users:", err);
      alert("Failed to load users for assignment");
    }
  };

  // Handle device assignment
  const handleAssignDevice = async (userId: number) => {
    if (!selectedDevice) return;
    
    setAssigning(true);
    try {
      await api.post(`/admin/devices/${selectedDevice.serial}/assign`, { user_id: userId });
      alert(`Device ${selectedDevice.serial} assigned successfully!`);
      setShowAssignModal(false);
      setSelectedDevice(null);
      loadData(currentPage, searchTerm); // Refresh the list
    } catch (err: any) {
      console.error("Assign error:", err);
      alert(err.response?.data?.error || "Failed to assign device");
    } finally {
      setAssigning(false);
    }
  };

  // Refresh function for button click
  const handleRefresh = () => {
    loadData(currentPage, searchTerm);
  };

  // Debounced search function
  useEffect(() => {
    if (activeTab !== "users" && activeTab !== "devices") {
      return;
    }

    const timeout = setTimeout(() => {
      setCurrentPage(1);
      loadData(1, searchTerm);
    }, 500);

    return () => clearTimeout(timeout);
  }, [searchTerm, activeTab]);

  // Load data when tab changes or page changes
  useEffect(() => {
    loadData(currentPage, searchTerm);
  }, [activeTab, currentPage]);

  const handleCreateDevice = async (deviceData: { serial: string; device_secret: string }) => {
    try {
      await api.post("/admin/devices", deviceData);
      alert("Device created successfully!");
      setShowDeviceModal(false);
      loadData(currentPage, searchTerm);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to create device");
    }
  };

  const handleCreateUser = async (userData: any) => {
    try {
      await api.post("/admin/users", userData);
      setShowUserModal(false);
      loadData(currentPage, searchTerm);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to create user");
    }
  };

  const handleUpdateUser = async (userData: any) => {
    try {
      await api.put(`/admin/users/${selectedUser.id}`, userData);
      setShowUserModal(false);
      loadData(currentPage, searchTerm);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to update user");
    }
  };

  const handleDeleteUser = async (userId: number, userPhone: string) => {
    if (confirm(`Are you sure you want to delete user ${userPhone}? This will also deactivate their devices.`)) {
      try {
        await api.delete(`/admin/users/${userId}`);
        loadData(currentPage, searchTerm);
      } catch (err: any) {
        alert(err.response?.data?.error || "Failed to delete user");
      }
    }
  };

  const handleDeactivateDevice = async (serial: string) => {
    if (confirm(`Deactivate device ${serial}? The user will lose access to this device.`)) {
      try {
        await api.post(`/admin/devices/${serial}/deactivate`);
        alert("Device deactivated successfully!");
        loadData(currentPage, searchTerm);
      } catch (err: any) {
        console.error("Deactivate error:", err);
        alert(err.response?.data?.error || "Failed to deactivate device");
      }
    }
  };

  const handleDeleteDevice = async (serial: string) => {
    if (confirm(`Permanently delete device ${serial}? This action cannot be undone.`)) {
      try {
        await api.delete(`/admin/devices/${serial}`);
        loadData(currentPage, searchTerm);
      } catch (err: any) {
        alert(err.response?.data?.error || "Failed to delete device");
      }
    }
  };

  const handleActivateDevice = async (serial: string, currentSecret: string) => {
    const secret = prompt("Enter device secret to activate:", currentSecret);
    if (secret) {
      try {
        await api.put(`/admin/devices/${serial}`, {
          device_secret: secret,
          is_active: true
        });
        alert("Device activated successfully!");
        loadData(currentPage, searchTerm);
      } catch (err: any) {
        alert(err.response?.data?.error || "Failed to activate device");
      }
    }
  };

  // Format date with time - returns object or null
  const formatDateTime = (dateString: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString()
    };
  };

  // If not admin, redirect
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  useEffect(() => {
    if (!user || user.role !== "admin") {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <ResponsiveLayout>
      <div className={`max-w-7xl mx-auto ${isRTL ? "text-right" : ""}`}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Admin Panel
          </h1>
          <p className="text-gray-500 mt-1">Complete system management</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Users</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total_users || 0}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Devices</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total_devices || 0}</p>
              </div>
              <Smartphone className="w-8 h-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Active Devices</p>
                <p className="text-2xl font-bold text-green-600">{stats.active_devices || 0}</p>
              </div>
              <Activity className="w-8 h-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Locations</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total_locations?.toLocaleString() || 0}</p>
              </div>
              <Eye className="w-8 h-8 text-purple-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Recent Activations</p>
                <p className="text-2xl font-bold text-orange-600">{stats.recent_activations || 0}</p>
              </div>
              <Calendar className="w-8 h-8 text-orange-500" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {[
                { id: "users", label: "Users", icon: Users },
                { id: "devices", label: "Devices", icon: Smartphone },
                { id: "logs", label: "Audit Logs", icon: Eye },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setCurrentPage(1);
                    setSearchTerm("");
                  }}
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
            {/* Search and Add Button */}
            {(activeTab === "users" || activeTab === "devices") && (
              <div className="flex justify-between items-center mb-6 gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder={`Search ${activeTab} by name or ID...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                {activeTab === "users" && (
                  <button
                    onClick={() => {
                      setModalMode("create");
                      setSelectedUser(null);
                      setShowUserModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    <Plus className="w-4 h-4" />
                    Add User
                  </button>
                )}
                {activeTab === "devices" && (
                  <button
                    onClick={() => setShowDeviceModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" />
                    Add Device
                  </button>
                )}
                <button
                  onClick={handleRefresh}
                  className="p-2 text-gray-500 hover:text-gray-700"
                  title="Refresh"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
                <p className="mt-2 text-gray-500">Loading...</p>
              </div>
            )}

            {/* Users Tab */}
            {!loading && activeTab === "users" && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Joined</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => {
                        const joined = formatDateTime(user.created_at);
                        return (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{user.id}</td>
                            <td 
                              className="px-4 py-3 text-sm font-mono text-blue-600 hover:text-blue-800 cursor-pointer"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowDevicesModal(true);
                              }}
                            >
                              {user.phone}
                            </td>
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
                              {joined ? (
                                <div className="flex flex-col">
                                  <span>{joined.date}</span>
                                  <span className="text-xs text-gray-500">{joined.time}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setModalMode("edit");
                                    setShowUserModal(true);
                                  }}
                                  className="text-blue-600 hover:text-blue-800"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user.id, user.phone)}
                                  className="text-red-600 hover:text-red-800"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowDevicesModal(true);
                                  }}
                                  className="text-green-600 hover:text-green-800"
                                  title="View Devices"
                                >
                                  <Smartphone className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {/* Pagination */}
                {totalItems > itemsPerPage && (
                  <div className="flex justify-center gap-2 mt-6">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 border rounded-lg disabled:opacity-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-4 py-2">
                      Page {currentPage} of {Math.ceil(totalItems / itemsPerPage)}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={currentPage >= Math.ceil(totalItems / itemsPerPage)}
                      className="p-2 border rounded-lg disabled:opacity-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Devices Tab */}
            {!loading && activeTab === "devices" && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Serial</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Secret</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">User</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Created At</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Last Modified</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {devices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          No devices found. Click "Add Device" to create one.
                        </td>
                      </tr>
                    ) : (
                      devices.map((device) => {
                        const created = formatDateTime(device.created_at);
                        const modified = formatDateTime(device.last_modified_at);
                        return (
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
                              {device.user_phone ? (
                                <span className="text-blue-600">{device.user_phone}</span>
                              ) : (
                                <span className="text-gray-400">Not assigned</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {created ? (
                                <div className="flex flex-col">
                                  <span>{created.date}</span>
                                  <span className="text-xs text-gray-500">{created.time}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {modified ? (
                                <div className="flex flex-col">
                                  <span>{modified.date}</span>
                                  <span className="text-xs text-gray-500">{modified.time}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                {!device.user_id && (
                                  <button
                                    onClick={() => {
                                      setSelectedDevice(device);
                                      loadUsersForAssignment();
                                      setShowAssignModal(true);
                                    }}
                                    className="text-blue-600 hover:text-blue-800"
                                    title="Assign to User"
                                  >
                                    <UserPlus className="w-4 h-4" />
                                  </button>
                                )}
                                {!device.is_active && device.user_id && (
                                  <button
                                    onClick={() => handleActivateDevice(device.serial, device.device_secret)}
                                    className="text-green-600 hover:text-green-800"
                                    title="Activate"
                                  >
                                    <Activity className="w-4 h-4" />
                                  </button>
                                )}
                                {device.is_active && (
                                  <button
                                    onClick={() => handleDeactivateDevice(device.serial)}
                                    className="text-orange-600 hover:text-orange-800"
                                    title="Deactivate"
                                  >
                                    <Power className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteDevice(device.serial)}
                                  className="text-red-600 hover:text-red-800"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Logs Tab */}
            {!loading && activeTab === "logs" && (
              <div className="space-y-3">
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No logs found
                  </div>
                ) : (
                  logs.map((log) => (
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
                      {log.details && (
                        <div className="mt-2 text-xs text-gray-400 font-mono">
                          {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <UserModal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        onSave={modalMode === "create" ? handleCreateUser : handleUpdateUser}
        user={selectedUser}
        mode={modalMode}
      />

      <UserDevicesModal
        isOpen={showDevicesModal}
        onClose={() => setShowDevicesModal(false)}
        userId={selectedUser?.id}
        userPhone={selectedUser?.phone}
      />

      <DeviceModal
        isOpen={showDeviceModal}
        onClose={() => setShowDeviceModal(false)}
        onSave={handleCreateDevice}
      />

      {/* Assign Device Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-semibold">Assign Device to User</h3>
                <p className="text-sm text-gray-500 mt-1">Device: {selectedDevice?.serial}</p>
              </div>
              <button 
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedDevice(null);
                }} 
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select User
                </label>
                <select
                  onChange={(e) => handleAssignDevice(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  defaultValue=""
                  disabled={assigning}
                >
                  <option value="" disabled>Select a user...</option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.phone} ({user.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Assigning a device to a user will automatically activate it.
                  The user will be able to see this device in their dashboard.
                </p>
              </div>

              {assigning && (
                <div className="text-center py-2">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent"></div>
                  <span className="ml-2 text-sm text-gray-600">Assigning...</span>
                </div>
              )}

              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedDevice(null);
                }}
                className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
                disabled={assigning}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ResponsiveLayout>
  );
}