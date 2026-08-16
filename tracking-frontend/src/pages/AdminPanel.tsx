import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import { useLanguage } from "../context/LanguageContext";
import { useAuthStore } from "../store/authStore";
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
      toast.error("Failed to load data");
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
      toast.error("Failed to load users");
    }
  };

  // Handle device assignment
  const handleAssignDevice = async (userId: number) => {
    if (!selectedDevice) return;
    
    setAssigning(true);
    try {
      await api.post(`/admin/devices/${selectedDevice.serial}/assign`, { user_id: userId });
      toast.success(`Device ${selectedDevice.serial} assigned successfully!`);
      setShowAssignModal(false);
      setSelectedDevice(null);
      loadData(currentPage, searchTerm); // Refresh the list
    } catch (err: any) {
      console.error("Assign error:", err);
      toast.error(err.response?.data?.error || "Failed to assign device");
    } finally {
      setAssigning(false);
    }
  };

  // Refresh function for button click
  const handleRefresh = () => {
    loadData(currentPage, searchTerm);
  };

  // Debounced reload. This effect previously coexisted with a second one that
  // also loaded on tab change, so every mount and every tab switch fired two
  // identical rounds of requests. Debouncing all three inputs here keeps it to
  // one, and typing in the search box still waits for a pause.
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const delay = isFirstLoad.current ? 0 : 400;
    isFirstLoad.current = false;

    const timeout = setTimeout(() => {
      loadData(currentPage, searchTerm);
    }, delay);

    return () => clearTimeout(timeout);
  }, [searchTerm, activeTab, currentPage]);

  const handleCreateDevice = async (deviceData: { serial: string; device_secret: string }) => {
    try {
      await api.post("/admin/devices", deviceData);
      toast.success("Device created successfully");
      setShowDeviceModal(false);
      loadData(currentPage, searchTerm);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create device");
    }
  };

  const handleCreateUser = async (userData: any) => {
    try {
      await api.post("/admin/users", userData);
      setShowUserModal(false);
      loadData(currentPage, searchTerm);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create user");
    }
  };

  const handleUpdateUser = async (userData: any) => {
    try {
      await api.put(`/admin/users/${selectedUser.id}`, userData);
      setShowUserModal(false);
      loadData(currentPage, searchTerm);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update user");
    }
  };

  const handleDeleteUser = async (userId: number, userPhone: string) => {
    if (confirm(`Are you sure you want to delete user ${userPhone}? This will also deactivate their devices.`)) {
      try {
        await api.delete(`/admin/users/${userId}`);
        loadData(currentPage, searchTerm);
      } catch (err: any) {
        toast.error(err.response?.data?.error || "Failed to delete user");
      }
    }
  };

  const handleDeactivateDevice = async (serial: string) => {
    if (confirm(`Deactivate device ${serial}? The user will lose access to this device.`)) {
      try {
        await api.post(`/admin/devices/${serial}/deactivate`);
        toast.success("Device deactivated");
        loadData(currentPage, searchTerm);
      } catch (err: any) {
        console.error("Deactivate error:", err);
        toast.error(err.response?.data?.error || "Failed to deactivate device");
      }
    }
  };

  const handleDeleteDevice = async (serial: string) => {
    if (confirm(`Permanently delete device ${serial}? This action cannot be undone.`)) {
      try {
        await api.delete(`/admin/devices/${serial}`);
        loadData(currentPage, searchTerm);
      } catch (err: any) {
        toast.error(err.response?.data?.error || "Failed to delete device");
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
        toast.success("Device activated");
        loadData(currentPage, searchTerm);
      } catch (err: any) {
        toast.error(err.response?.data?.error || "Failed to activate device");
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

  // The <RequireAdmin> route guard already handles redirecting non-admins;
  // this is just a render-time backstop. Reading from the store instead of
  // re-parsing localStorage avoids producing a new object identity (and so a
  // re-fired effect) on every single render.
  const currentUser = useAuthStore((state) => state.user);

  if (currentUser?.role !== "admin") {
    return null;
  }

  return (
    <ResponsiveLayout>
      <div className={`max-w-7xl mx-auto ${isRTL ? "text-right" : ""}`}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-content flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Admin Panel
          </h1>
          <p className="text-content-muted mt-1">Complete system management</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-surface rounded-control shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-content-muted text-sm">Total Users</p>
                <p className="text-2xl font-bold text-content">{stats.total_users || 0}</p>
              </div>
              <Users className="w-8 h-8 text-series-1" />
            </div>
          </div>
          
          <div className="bg-surface rounded-control shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-content-muted text-sm">Total Devices</p>
                <p className="text-2xl font-bold text-content">{stats.total_devices || 0}</p>
              </div>
              <Smartphone className="w-8 h-8 text-series-3" />
            </div>
          </div>
          
          <div className="bg-surface rounded-control shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-content-muted text-sm">Active Devices</p>
                <p className="text-2xl font-bold text-status-good">{stats.active_devices || 0}</p>
              </div>
              <Activity className="w-8 h-8 text-series-3" />
            </div>
          </div>
          
          <div className="bg-surface rounded-control shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-content-muted text-sm">Total Locations</p>
                <p className="text-2xl font-bold text-content">{stats.total_locations?.toLocaleString() || 0}</p>
              </div>
              <Eye className="w-8 h-8 text-series-6" />
            </div>
          </div>

          <div className="bg-surface rounded-control shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-content-muted text-sm">Recent Activations</p>
                <p className="text-2xl font-bold text-series-2">{stats.recent_activations || 0}</p>
              </div>
              <Calendar className="w-8 h-8 text-series-2" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-surface rounded-card shadow-sm overflow-hidden">
          <div className="border-b border-line">
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
                      ? "border-brand text-brand"
                      : "border-transparent text-content-muted hover:text-content-secondary hover:border-line"
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-content-muted" />
                  <input
                    type="text"
                    placeholder={`Search ${activeTab} by name or ID...`}
                    value={searchTerm}
                    onChange={(e) => {
                      // Reset to the first page, or a search can land on an
                      // out-of-range offset and look like "no results".
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-line rounded-control focus:border-brand"
                  />
                </div>
                {activeTab === "users" && (
                  <button
                    onClick={() => {
                      setModalMode("create");
                      setSelectedUser(null);
                      setShowUserModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-control hover:bg-brand-hover"
                  >
                    <Plus className="w-4 h-4" />
                    Add User
                  </button>
                )}
                {activeTab === "devices" && (
                  <button
                    onClick={() => setShowDeviceModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-status-good text-white rounded-control hover:brightness-110"
                  >
                    <Plus className="w-4 h-4" />
                    Add Device
                  </button>
                )}
                <button
                  onClick={handleRefresh}
                  className="p-2 text-content-muted hover:text-content-secondary"
                  title="Refresh"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand border-t-transparent"></div>
                <p className="mt-2 text-content-muted">Loading...</p>
              </div>
            )}

            {/* Users Tab */}
            {!loading && activeTab === "users" && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-sunken">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Joined</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-content-muted">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => {
                        const joined = formatDateTime(user.created_at);
                        return (
                          <tr key={user.id} className="hover:bg-surface-sunken">
                            <td className="px-4 py-3 text-sm">{user.id}</td>
                            <td 
                              className="px-4 py-3 text-sm font-mono text-brand hover:text-brand-hover cursor-pointer"
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
                                  ? "bg-series-6/10 text-series-6" 
                                  : "bg-surface-sunken text-content-secondary"
                              }`}>
                                {user.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {joined ? (
                                <div className="flex flex-col">
                                  <span>{joined.date}</span>
                                  <span className="text-xs text-content-muted">{joined.time}</span>
                                </div>
                              ) : (
                                <span className="text-content-muted">-</span>
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
                                  className="text-brand hover:text-brand-hover"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user.id, user.phone)}
                                  className="text-status-critical hover:brightness-110"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowDevicesModal(true);
                                  }}
                                  className="text-status-good hover:brightness-110"
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
                      className="p-2 border rounded-control disabled:opacity-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-4 py-2">
                      Page {currentPage} of {Math.ceil(totalItems / itemsPerPage)}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={currentPage >= Math.ceil(totalItems / itemsPerPage)}
                      className="p-2 border rounded-control disabled:opacity-50"
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
                  <thead className="bg-surface-sunken">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Serial</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Secret</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">User</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Created At</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Last Modified</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {devices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-content-muted">
                          No devices found. Click "Add Device" to create one.
                        </td>
                      </tr>
                    ) : (
                      devices.map((device) => {
                        const created = formatDateTime(device.created_at);
                        const modified = formatDateTime(device.last_modified_at);
                        return (
                          <tr key={device.serial} className="hover:bg-surface-sunken">
                            <td className="px-4 py-3 font-mono text-sm">{device.serial}</td>
                            <td className="px-4 py-3 font-mono text-sm">{device.device_secret}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                                device.is_active 
                                  ? "bg-status-good-bg text-status-good" 
                                  : "bg-status-warning-bg text-status-warning"
                              }`}>
                                {device.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {device.user_phone ? (
                                <span className="text-brand">{device.user_phone}</span>
                              ) : (
                                <span className="text-content-muted">Not assigned</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {created ? (
                                <div className="flex flex-col">
                                  <span>{created.date}</span>
                                  <span className="text-xs text-content-muted">{created.time}</span>
                                </div>
                              ) : (
                                <span className="text-content-muted">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {modified ? (
                                <div className="flex flex-col">
                                  <span>{modified.date}</span>
                                  <span className="text-xs text-content-muted">{modified.time}</span>
                                </div>
                              ) : (
                                <span className="text-content-muted">-</span>
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
                                    className="text-brand hover:text-brand-hover"
                                    title="Assign to User"
                                  >
                                    <UserPlus className="w-4 h-4" />
                                  </button>
                                )}
                                {!device.is_active && device.user_id && (
                                  <button
                                    onClick={() => handleActivateDevice(device.serial, device.device_secret)}
                                    className="text-status-good hover:brightness-110"
                                    title="Activate"
                                  >
                                    <Activity className="w-4 h-4" />
                                  </button>
                                )}
                                {device.is_active && (
                                  <button
                                    onClick={() => handleDeactivateDevice(device.serial)}
                                    className="text-status-serious hover:brightness-110"
                                    title="Deactivate"
                                  >
                                    <Power className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteDevice(device.serial)}
                                  className="text-status-critical hover:brightness-110"
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
                  <div className="text-center py-8 text-content-muted">
                    No logs found
                  </div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="bg-surface-sunken rounded-control p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-content-muted">#{log.id}</span>
                          <span className="px-2 py-1 bg-series-1/10 text-brand-ink text-xs rounded-full">
                            {log.action}
                          </span>
                          <span className="text-sm text-content-secondary">
                            {log.entity_type}: {log.entity_id}
                          </span>
                        </div>
                        <span className="text-xs text-content-muted">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-content-muted">
                        User: {log.user_phone || "System"} | IP: {log.ip_address}
                      </div>
                      {log.details && (
                        <div className="mt-2 text-xs text-content-muted font-mono">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-card p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-semibold">Assign Device to User</h3>
                <p className="text-sm text-content-muted mt-1">Device: {selectedDevice?.serial}</p>
              </div>
              <button 
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedDevice(null);
                }} 
                className="text-content-muted hover:text-content-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Select User
                </label>
                <select
                  onChange={(e) => handleAssignDevice(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-line rounded-control focus:border-brand"
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

              <div className="bg-brand-subtle border border-brand/20 rounded-control p-3">
                <p className="text-xs text-brand-ink">
                  <strong>Note:</strong> Assigning a device to a user will automatically activate it.
                  The user will be able to see this device in their dashboard.
                </p>
              </div>

              {assigning && (
                <div className="text-center py-2">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-brand border-t-transparent"></div>
                  <span className="ml-2 text-sm text-content-secondary">Assigning...</span>
                </div>
              )}

              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedDevice(null);
                }}
                className="w-full bg-surface-sunken text-content-secondary py-2 rounded-control hover:bg-surface-sunken transition"
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