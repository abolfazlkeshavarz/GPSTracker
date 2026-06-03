import { ReactNode, useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useLanguage } from "../../context/LanguageContext";
import LanguageSwitcher from "../LanguageSwitcher";
import { 
  LayoutDashboard, 
  PlusCircle, 
  LogOut, 
  Shield,
  Menu,
  X,
  MapPin
} from "lucide-react";

interface Props {
  children: ReactNode;
}

export default function MobileLayout({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuthStore();
  const { t, isRTL } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setIsMenuOpen(false);
  };

  const navItems = [
    { path: "/dashboard", label: t("dashboard"), icon: LayoutDashboard, color: "blue" },
    { path: "/activate", label: t("activate.device"), icon: PlusCircle, color: "green" },
    ...(user?.role === "admin" ? [{ path: "/admin", label: "Admin Panel", icon: Shield, color: "purple" }] : []),
  ];

  // If not mobile, use original layout or just return children
  if (!isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        <div className={`fixed top-0 bottom-0 w-64 bg-white shadow-xl ${isRTL ? "right-0" : "left-0"}`}>
          {/* Original sidebar content */}
          <div className="flex flex-col h-full">
            <div className="p-6 border-b">
              <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                {t("gps.tracker")}
              </h1>
            </div>
            <div className="p-4 border-b bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
                  {user?.phone?.charAt(0) || "U"}
                </div>
                <div className="text-sm">
                  <p className="font-medium">{user?.phone}</p>
                  <p className="text-gray-500">{t("online")}</p>
                </div>
              </div>
            </div>
            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 text-gray-700 hover:text-blue-600"
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="p-4 border-t space-y-3">
              <div className="flex justify-center">
                <LanguageSwitcher />
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 text-red-600 rounded-xl hover:bg-red-50"
              >
                <LogOut className="w-5 h-5" />
                <span>{t("logout")}</span>
              </button>
            </div>
          </div>
        </div>
        <div className={`${isRTL ? "mr-64" : "ml-64"} p-4 md:p-8`}>
          {children}
        </div>
      </div>
    );
  }

  // Mobile layout with fixed positioning
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-50 to-blue-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-md px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
            {t("gps.tracker")}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-medium">{user?.phone}</p>
            <p className="text-xs text-gray-500">{t("online")}</p>
          </div>
          <button
            onClick={() => setIsMenuOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Main Content - Scrollable area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {children}
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex-shrink-0">
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition ${
                  isActive 
                    ? `text-${item.color}-600 bg-${item.color}-50` 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-red-500 hover:bg-red-50 transition"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-xs">{t("logout")}</span>
          </button>
        </div>
      </div>

      {/* Slide-out Menu */}
      {isMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className={`fixed top-0 bottom-0 w-64 bg-white shadow-2xl z-50 ${
            isRTL ? "right-0" : "left-0"
          } transform transition-transform duration-300`}>
            <div className="flex justify-end p-4">
              <button onClick={() => setIsMenuOpen(false)} className="p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg">
                  {user?.phone?.charAt(0) || "U"}
                </div>
                <div>
                  <p className="font-medium">{user?.phone}</p>
                  <p className="text-xs text-gray-500">{t("online")}</p>
                  {user?.role === "admin" && (
                    <p className="text-xs text-purple-600 font-semibold mt-1">Admin</p>
                  )}
                </div>
              </div>
            </div>
            <nav className="p-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 text-gray-700"
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
              <div className="pt-4 border-t">
                <div className="flex justify-center mb-3">
                  <LanguageSwitcher />
                </div>
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}