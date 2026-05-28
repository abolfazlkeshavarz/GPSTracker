import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activateDevice } from "../api/devices";
import DashboardLayout from "../components/layout/DashboardLayout";
import { QrCode, CheckCircle, XCircle, Cpu, AlertCircle, Key, Shield } from "lucide-react";

export default function ActivateDevice() {
  const navigate = useNavigate();
  const [serial, setSerial] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleActivate = async () => {
    if (!serial.trim()) {
      setMessage({ type: 'error', text: 'Please enter a device serial number' });
      return;
    }
    
    if (!secret.trim()) {
      setMessage({ type: 'error', text: 'Please enter the device secret key' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      await activateDevice(serial, secret);
      setMessage({ type: 'success', text: 'Device activated successfully!' });
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (err: any) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.error || "Activation failed. Please check the serial number and secret." 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Activate Device
          </h1>
          <p className="text-gray-500 mt-1">Add a new GPS tracker to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Device Registration</h2>
                <p className="text-blue-100 text-sm">Enter your device credentials</p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Serial Number
                </label>
                <div className="relative">
                  <QrCode className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Enter device serial (e.g., TEST003)"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value.toUpperCase())}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  The serial number is printed on your GPS device label
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device Secret Key
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    placeholder="Enter device secret key"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  The secret key is provided with your device
                </p>
              </div>

              {message && (
                <div className={`p-4 rounded-xl flex items-start space-x-3 ${
                  message.type === 'success' 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  {message.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      message.type === 'success' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {message.text}
                    </p>
                    {message.type === 'success' && (
                      <p className="text-sm text-green-600 mt-1">
                        Redirecting to dashboard...
                      </p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleActivate}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Activating...</span>
                  </div>
                ) : (
                  "Activate Device"
                )}
              </button>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">Security Note</h3>
                    <p className="text-xs text-blue-700">
                      The secret key is required to authenticate your device. Keep it secure and never share it.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Need help?</h3>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    • Make sure your device is powered on
                  </p>
                  <p className="text-sm text-gray-600">
                    • Check that the serial number and secret are correct
                  </p>
                  <p className="text-sm text-gray-600">
                    • Contact support if you continue having issues
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}