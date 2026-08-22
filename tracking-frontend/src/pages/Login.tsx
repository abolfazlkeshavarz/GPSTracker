import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Lock, LogIn, MapPin, Phone } from "lucide-react";

import { loginUser } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { Button, Input } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { t } = useLanguage();
  const { cycleTheme, theme } = useTheme();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // A real <form> so Enter submits and password managers recognise the fields.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!phone.trim() || !password) {
      setError(t("login.failed"));
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await loginUser(phone.trim(), password);

      // Never logged: the response carries the bearer token.
      if (data?.token && data?.user) {
        login(data.token, data.user);
        navigate("/dashboard", { replace: true });
      } else {
        setError("Invalid response from server");
      }
    } catch (err: any) {
      setError(
        err?.response?.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : err?.response?.data?.error || t("login.failed")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-page flex flex-col overflow-hidden">
      {/* Same hairline grid as the dashboard hero, so the product reads as one
          system from the first screen. */}
      <div className="absolute inset-0 bg-grid bg-grid-fade pointer-events-none" aria-hidden />

      <div className="relative flex items-center justify-end gap-2 p-4">
        <LanguageSwitcher />
        <button
          onClick={cycleTheme}
          className="px-2.5 h-8 rounded-control border border-line text-xs font-medium text-content-secondary hover:bg-surface-sunken capitalize"
          aria-label={`Theme: ${theme}. Click to change.`}
        >
          {theme}
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-brand text-white shadow-glow mb-4">
              <MapPin className="w-7 h-7" />
            </span>
            <h1 className="text-display text-content">{t("gps.tracker")}</h1>
            <p className="text-sm text-content-muted mt-1.5">{t("welcome.back")}</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-card shadow-lg p-6 space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-control bg-status-critical-bg border border-status-critical/25 text-sm text-status-critical"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Input
              name="phone"
              label={t("phone.number")}
              placeholder="admin or 09123456789"
              autoComplete="username"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              leadingIcon={<Phone className="w-4 h-4" />}
            />

            <Input
              name="password"
              label={t("password")}
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leadingIcon={<Lock className="w-4 h-4" />}
              trailingSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="p-2 rounded-control text-content-muted hover:text-content-secondary"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <Button type="submit" size="lg" fullWidth loading={loading} icon={<LogIn className="w-4 h-4" />}>
              {t("sign.in")}
            </Button>
          </form>

          <p className="text-center text-sm text-content-muted mt-6">
            {t("dont.have.account")}{" "}
            <Link to="/register" className="text-brand font-medium hover:underline">
              {t("create.account")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
