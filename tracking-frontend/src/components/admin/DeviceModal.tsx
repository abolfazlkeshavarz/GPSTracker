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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-6 h-6 text-green-600" />
            <h3 className="text-xl font-semibold">Add New Device</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Serial Number
            </label>
            <input
              type="text"
              required
              value={formData.serial}
              onChange={handleSerialChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 font-mono uppercase"
              placeholder="e.g., DEVICE001"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              Unique identifier for the GPS device (automatically uppercase)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device Secret Key
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                required
                value={formData.device_secret}
                onChange={(e) => setFormData({ ...formData, device_secret: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 font-mono"
                placeholder="Enter secret key"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Secret key used to authenticate the device
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> The device will be created in inactive state. 
              Users can activate it using the serial number and secret key.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition"
            >
              Create Device
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}