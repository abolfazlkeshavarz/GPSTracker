import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useLanguage } from "../../context/LanguageContext";
import LanguageSwitcher from "../LanguageSwitcher";
import { LayoutDashboard, PlusCircle, LogOut } from "lucide-react";

interface Props {
  children: ReactNode;
}

export default function DashboardLayout({ children }: Props) {
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();
  const { t, isRTL } = useLanguage();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">

      {/* Sidebar */}
      <div className={`fixed top-0 bottom-0 w-64 bg-white shadow-xl ${isRTL ? "right-0" : "left-0"}`}>

        <div className="flex flex-col h-full">

          {/* logo */}
          <div className="p-6 border-b">
            <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              {t("gps.tracker")}
            </h1>
          </div>

          {/* user */}
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

          {/* nav */}
          <nav className="flex-1 p-4 space-y-2">

            <Link
              to="/dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 text-gray-700 hover:text-blue-600"
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>{t("dashboard")}</span>
            </Link>

            <Link
              to="/activate"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-green-50 text-gray-700 hover:text-green-600"
            >
              <PlusCircle className="w-5 h-5" />
              <span>{t("activate.device")}</span>
            </Link>
          </nav>

          {/* bottom */}
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

      {/* content */}
      <div className={`${isRTL ? "mr-64" : "ml-64"} p-8`}>
        {children}
      </div>
    </div>
  );
}