import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activateDevice } from "../api/devices";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useLanguage } from "../context/LanguageContext";
import { QrCode, CheckCircle, AlertCircle, Key, Shield, Cpu } from "lucide-react";

export default function ActivateDevice() {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const [serial, setSerial] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleActivate = async () => {
    if (!serial.trim()) {
      setMessage({ type: 'error', text: t('please.enter.serial') });
      return;
    }
    
    if (!secret.trim()) {
      setMessage({ type: 'error', text: t('please.enter.secret') });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      await activateDevice(serial, secret);
      setMessage({ type: 'success', text: t('activation.success') });
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
      <div className={`max-w-2xl mx-auto ${isRTL ? 'text-right' : ''}`}>
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            {t('activate.device.title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('add.new.gps.tracker')}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
            <div className={`flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-3'}`}>
              <div className="p-2 bg-white/20 rounded-lg">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{t('device.registration')}</h2>
                <p className="text-blue-100 text-sm">{t('enter.device.credentials')}</p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('serial.number')}
                </label>
                <div className="relative">
                  <QrCode className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
                  <input
                    type="text"
                    placeholder={t('enter.device.serial')}
                    value={serial}
                    onChange={(e) => setSerial(e.target.value.toUpperCase())}
                    className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono ${isRTL ? 'text-right' : ''}`}
                    autoFocus
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {t('serial.hint')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('device.secret.key')}
                </label>
                <div className="relative">
                  <Key className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
                  <input
                    type="password"
                    placeholder={t('enter.device.secret')}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono ${isRTL ? 'text-right' : ''}`}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {t('secret.hint')}
                </p>
              </div>

              {message && (
                <div className={`p-4 rounded-xl flex items-start ${isRTL ? 'space-x-reverse' : 'space-x-3'} ${
                  message.type === 'success' 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  {message.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className={isRTL ? 'text-right' : ''}>
                    <p className={`font-medium ${
                      message.type === 'success' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {message.text}
                    </p>
                    {message.type === 'success' && (
                      <p className="text-sm text-green-600 mt-1">
                        {t('redirecting')}
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
                  <div className={`flex items-center justify-center ${isRTL ? 'space-x-reverse' : 'space-x-2'}`}>
                    <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>{t('activating')}</span>
                  </div>
                ) : (
                  t('activate')
                )}
              </button>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className={`flex items-start ${isRTL ? 'space-x-reverse' : 'space-x-3'}`}>
                  <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className={isRTL ? 'text-right' : ''}>
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">{t('security.note')}</h3>
                    <p className="text-xs text-blue-700">
                      {t('security.note.text')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('need.help')}</h3>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    • {t('help.line1')}
                  </p>
                  <p className="text-sm text-gray-600">
                    • {t('help.line2')}
                  </p>
                  <p className="text-sm text-gray-600">
                    • {t('help.line3')}
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