import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle2, Cpu, Key, QrCode, Shield } from "lucide-react";

import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import { useLanguage } from "../context/LanguageContext";
import { activateDevice } from "../api/devices";
import { Button, Card, CardHeader, Input, PageHeading } from "../components/ui";

export default function ActivateDevice() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [serial, setSerial] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!serial.trim() || !secret.trim()) {
      setError(t("please.enter.serial"));
      return;
    }

    try {
      setLoading(true);
      await activateDevice(serial.trim(), secret.trim());

      setDone(true);
      toast.success(t("activation.success"));
      setTimeout(() => navigate("/dashboard"), 1200);
    } catch (err: any) {
      // Distinguish the cases the server actually separates, so the user knows
      // whether to check the serial or the secret.
      const status = err?.response?.status;
      const message =
        status === 404
          ? "No device with that serial. Check the number, or ask an admin to register it."
          : status === 401
          ? "That secret does not match this device."
          : status === 409
          ? "This device is already activated on another account."
          : status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : err?.response?.data?.error || "Activation failed.";

      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveLayout>
      <div className="max-w-xl mx-auto">
        <PageHeading title={t("activate.device.title")} subtitle={t("add.new.gps.tracker")} />

        <Card flush>
          <CardHeader title={t("device.registration")} subtitle={t("enter.device.credentials")} />

          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            <Input
              name="serial"
              label={t("serial.number")}
              placeholder={t("enter.device.serial")}
              hint={t("serial.hint")}
              value={serial}
              autoFocus
              className="font-mono"
              onChange={(e) => setSerial(e.target.value.toUpperCase())}
              leadingIcon={<QrCode className="w-4 h-4" />}
            />

            <Input
              name="secret"
              type="password"
              label={t("device.secret.key")}
              placeholder={t("enter.device.secret")}
              hint={t("secret.hint")}
              value={secret}
              className="font-mono"
              onChange={(e) => setSecret(e.target.value)}
              leadingIcon={<Key className="w-4 h-4" />}
              error={error || undefined}
            />

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={loading}
              disabled={done}
              icon={done ? <CheckCircle2 className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
            >
              {done ? t("redirecting") : t("activate")}
            </Button>
          </form>
        </Card>

        <div className="mt-4 flex items-start gap-3 p-4 rounded-card bg-brand-subtle border border-brand/20">
          <Shield className="w-5 h-5 text-brand shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-brand-ink">{t("security.note")}</h3>
            <p className="text-xs text-content-secondary mt-1">{t("security.note.text")}</p>
          </div>
        </div>

        <Card className="mt-4">
          <h3 className="text-sm font-semibold text-content mb-2">{t("need.help")}</h3>
          <ul className="space-y-1.5 text-sm text-content-muted list-disc list-inside">
            <li>{t("help.line1")}</li>
            <li>{t("help.line2")}</li>
            <li>{t("help.line3")}</li>
          </ul>
        </Card>
      </div>
    </ResponsiveLayout>
  );
}
