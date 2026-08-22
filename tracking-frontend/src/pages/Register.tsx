import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AlertCircle, Eye, EyeOff, Lock, Phone, UserPlus } from "lucide-react";

import { registerUser } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import { useLanguage } from "../context/LanguageContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { Button, Input } from "../components/ui";

export default function Register() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const auth = useAuthStore();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    // Matches the server's rule, so the failure is immediate rather than a
    // round trip.
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      const data = await registerUser(phone.trim(), password);

      if (data?.token && data?.user) {
        auth.login(data.token, data.user);
        toast.success(t("register.success"));
        navigate("/dashboard", { replace: true });
      } else {
        toast.success(t("register.success"));
        navigate("/login", { replace: true });
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || t("register.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-page flex flex-col overflow-hidden">
      <div className="absolute inset-0 bg-grid bg-grid-fade pointer-events-none" aria-hidden />

      <div className="relative flex justify-end p-4">
        <LanguageSwitcher />
      </div>

      <div className="relative flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-brand text-white shadow-glow mb-4">
              <UserPlus className="w-7 h-7" />
            </span>
            <h1 className="text-display text-content">{t("create.account.title")}</h1>
            <p className="text-sm text-content-muted mt-1.5">{t("join.gps.tracker")}</p>
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
              placeholder="09123456789"
              autoComplete="username"
              inputMode="tel"
              required
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
              autoComplete="new-password"
              required
              minLength={6}
              hint="At least 6 characters."
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

            <Button type="submit" size="lg" fullWidth loading={loading} icon={<UserPlus className="w-4 h-4" />}>
              {t("create.account.btn")}
            </Button>
          </form>

          <p className="text-center text-sm text-content-muted mt-6">
            {t("already.have.account")}{" "}
            <Link to="/login" className="text-brand font-medium hover:underline">
              {t("sign.in")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
