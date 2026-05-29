import { useState } from "react";
import { loginUser } from "../api/auth";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useLanguage } from "../context/LanguageContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { LogIn, Phone, Lock, ArrowRight, MapPin } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore(); // Get login function
  const { t, isRTL } = useLanguage();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!phone || !password) {
      setError("Please enter phone and password");
      return;
    }
    
    try {
      setLoading(true);
      setError("");
      const data = await loginUser(phone, password);
      console.log("Login response:", data); // Debug log
      
      // Make sure we have token and user
      if (data.token && data.user) {
        login(data.token, data.user);
        console.log("Navigating to dashboard...");
        navigate("/dashboard");
      } else {
        setError("Invalid response from server");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.response?.data?.error || t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
          <div className="flex justify-between items-start">
            <div className="flex justify-center flex-1">
              <div className="p-3 bg-white/20 rounded-full">
                <MapPin className="w-8 h-8 text-white" />
              </div>
            </div>
            <LanguageSwitcher />
          </div>
          <h1 className="text-3xl font-bold text-white text-center mt-4">{t('gps.tracker')}</h1>
          <p className="text-blue-100 text-center mt-2">{t('welcome.back')}</p>
        </div>
        
        <div className="p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('phone.number')}</label>
              <div className="relative">
                <Phone className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
                <input
                  type="text"
                  placeholder="admin or 09123456789"
                  className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('password')}</label>
              <div className="relative">
                <Lock className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
                <input
                  type="password"
                  placeholder="••••••••"
                  className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
            </div>
            
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center space-x-2 rtl:space-x-reverse"
            >
              {loading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>{t('sign.in')}</span>
                  <ArrowRight className={`w-5 h-5 ${isRTL ? 'hidden' : ''}`} />
                </>
              )}
            </button>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              {t('dont.have.account')}{" "}
              <Link to="/register" className="text-blue-600 font-semibold hover:text-blue-700">
                {t('create.account')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}