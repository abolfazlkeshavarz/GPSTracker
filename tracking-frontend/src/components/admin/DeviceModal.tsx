import { useState } from "react";
import { X, Eye, EyeOff, Cpu } from "lucide-react";

interface DeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (deviceData: { serial: string; device_secret: string }) => void;
}

export default function DeviceModal({ isOpen, onClose, onSave }: DeviceModalProps) {
  const [formData, setFormData] = useState({
    serial: "",
    device_secret: "",
  });
  const [showSecret, setShowSecret] = useState(false);

  if (!isOpen) return null;

  const handleSerialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Automatically convert to uppercase
    setFormData({ ...formData, serial: e.target.value.toUpperCase() });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.serial && formData.device_secret) {
      onSave({
        serial: formData.serial.toUpperCase(), // Ensure uppercase
        device_secret: formData.device_secret,
      });
      setFormData({ serial: "", device_secret: "" });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-card p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-6 h-6 text-status-good" />
            <h3 className="text-xl font-semibold">Add New Device</h3>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Serial Number
            </label>
            <input
              type="text"
              required
              value={formData.serial}
              onChange={handleSerialChange}
              className="w-full px-3 py-2 border border-line rounded-control focus:ring-2 focus:ring-green-500 font-mono uppercase"
              placeholder="e.g., DEVICE001"
              autoFocus
            />
            <p className="text-xs text-content-muted mt-1">
              Unique identifier for the GPS device (automatically uppercase)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Device Secret Key
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                required
                value={formData.device_secret}
                onChange={(e) => setFormData({ ...formData, device_secret: e.target.value })}
                className="w-full px-3 py-2 border border-line rounded-control focus:ring-2 focus:ring-green-500 font-mono"
                placeholder="Enter secret key"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-content-muted"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-content-muted mt-1">
              Secret key used to authenticate the device
            </p>
          </div>

          <div className="bg-brand-subtle border border-brand/20 rounded-control p-3 mt-4">
            <p className="text-xs text-brand-ink">
              <strong>Note:</strong> The device will be created in inactive state. 
              Users can activate it using the serial number and secret key.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-status-good text-white py-2 rounded-control hover:brightness-110 transition"
            >
              Create Device
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface-sunken text-content-secondary py-2 rounded-control hover:bg-surface-sunken transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}