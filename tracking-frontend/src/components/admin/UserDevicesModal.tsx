import { useState, useEffect } from "react";
import { X, Smartphone, Calendar, Power } from "lucide-react";
import api from "../../api/axios";

interface UserDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  userPhone: string;
}

export default function UserDevicesModal({ isOpen, onClose, userId, userPhone }: UserDevicesModalProps) {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      loadUserDevices();
    }
  }, [isOpen, userId]);

  const loadUserDevices = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/users/${userId}/devices`);
      setDevices(response.data.devices);
    } catch (err) {
      console.error("Failed to load user devices:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-card p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-semibold">User Devices</h3>
            <p className="text-sm text-content-muted mt-1">{userPhone}</p>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : devices.length === 0 ? (
          <div className="text-center py-8 text-content-muted">
            <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No devices found for this user</p>
          </div>
        ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <div key={device.serial} className="border rounded-control p-4 hover:bg-surface-sunken">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono font-semibold text-lg">{device.serial}</p>
                  <div className="flex flex-col gap-1 mt-2 text-sm text-content-muted">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Power className="w-3 h-3" />
                        {device.is_active ? "Active" : "Inactive"}
                      </span>
                      {device.activated_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Activated: {new Date(device.activated_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span>Created: {new Date(device.created_at).toLocaleString()}</span>
                      {device.last_modified_at && (
                        <span>Modified: {new Date(device.last_modified_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}