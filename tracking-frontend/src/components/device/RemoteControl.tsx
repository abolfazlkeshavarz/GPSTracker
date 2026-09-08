import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Ban,
  CheckCircle2,
  Clock,
  Crosshair,
  Lock,
  Power,
  RefreshCw,
  Unlock,
  XCircle,
} from "lucide-react";

import {
  getCommands,
  issueCommand,
  type CommandName,
  type DeviceCommand,
} from "../../api/devices";
import { useLanguage } from "../../context/LanguageContext";
import { Badge, Button, Card, CardHeader, Skeleton, cx } from "../ui";

/*
Remote control.

The one panel in this app whose buttons move physical objects, so it is built
around making the consequences obvious rather than making the actions quick:

  - Cutting the engine and rebooting ask for confirmation, and the button says
    what will happen rather than naming a relay.
  - Nothing here claims success on a 202. A queued command shows as "queued"
    until the vehicle acknowledges it, because "did the engine actually cut?"
    is the only question that matters and a hopeful UI cannot answer it.
  - The server refuses an engine cut above walking pace. That refusal is shown
    verbatim; softening it into "something went wrong" would leave the user
    trying again instead of understanding why.
*/

interface Props {
  serial: string;
  /** Drives the polling cadence: a command in flight is worth watching. */
  online?: boolean;
}

const CONFIRM_REQUIRED: Partial<Record<CommandName, string>> = {
  engine_cut: "cut the engine",
  reboot: "reboot the tracker",
};

export default function RemoteControl({ serial, online }: Props) {
  const { t } = useLanguage();

  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<CommandName | null>(null);
  const [confirming, setConfirming] = useState<CommandName | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getCommands(serial, 8);
      setCommands(data.commands);
    } catch {
      // A failed history read must not disable the buttons.
    } finally {
      setLoading(false);
    }
  }, [serial]);

  useEffect(() => {
    load();
  }, [load]);

  // Acknowledgements arrive over MQTT, not the app's WebSocket, so the only
  // way to see one is to ask. Polled only while something is actually in
  // flight — a settled list needs no refreshing.
  const pending = commands.some((c) => c.status === "pending" || c.status === "sent");

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [pending, load]);

  const run = async (command: CommandName) => {
    const needsConfirm = command in CONFIRM_REQUIRED;

    if (needsConfirm && confirming !== command) {
      setConfirming(command);
      return;
    }

    setBusy(command);
    setConfirming(null);

    try {
      const cmd = await issueCommand(serial, command, { confirm: needsConfirm });

      toast.success(
        cmd.status === "sent"
          ? t("control.sent")
          : t("control.queued")
      );
      setCommands((prev) => [cmd, ...prev].slice(0, 8));
    } catch (err: unknown) {
      // The interlock refusal is a real answer, not a failure — show it.
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t("control.failed");
      toast.error(message, { duration: 6000 });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card flush>
      <CardHeader
        title={t("control.title")}
        subtitle={t("control.subtitle")}
        action={
          <Badge tone={online ? "good" : "neutral"}>
            {online ? t("online") : t("offline")}
          </Badge>
        }
      />

      <div className="p-5 space-y-4">
        {!online && (
          <p className="text-xs text-content-muted">{t("control.offline.note")}</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <ControlButton
            label={t("control.engine.cut")}
            icon={<Ban className="w-4 h-4" />}
            danger
            loading={busy === "engine_cut"}
            armed={confirming === "engine_cut"}
            armedLabel={t("control.confirm")}
            onClick={() => run("engine_cut")}
          />
          <ControlButton
            label={t("control.engine.restore")}
            icon={<Power className="w-4 h-4" />}
            loading={busy === "engine_restore"}
            onClick={() => run("engine_restore")}
          />
          <ControlButton
            label={t("control.door.lock")}
            icon={<Lock className="w-4 h-4" />}
            loading={busy === "door_lock"}
            onClick={() => run("door_lock")}
          />
          <ControlButton
            label={t("control.door.unlock")}
            icon={<Unlock className="w-4 h-4" />}
            loading={busy === "door_unlock"}
            onClick={() => run("door_unlock")}
          />
          <ControlButton
            label={t("control.locate")}
            icon={<Crosshair className="w-4 h-4" />}
            loading={busy === "locate"}
            onClick={() => run("locate")}
          />
          <ControlButton
            label={t("control.reboot")}
            icon={<RefreshCw className="w-4 h-4" />}
            loading={busy === "reboot"}
            armed={confirming === "reboot"}
            armedLabel={t("control.confirm")}
            onClick={() => run("reboot")}
          />
        </div>

        {confirming && (
          <p className="text-xs text-status-warning">
            {t("control.confirm.hint").replace("{action}", CONFIRM_REQUIRED[confirming] ?? "")}
          </p>
        )}

        <div className="border-t border-line pt-3">
          <p className="text-label font-semibold uppercase text-content-muted mb-2">
            {t("control.recent")}
          </p>

          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : commands.length === 0 ? (
            <p className="text-xs text-content-muted">{t("control.none")}</p>
          ) : (
            <ul className="space-y-1.5">
              {commands.map((cmd) => (
                <CommandRow key={cmd.id} cmd={cmd} t={t} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function ControlButton({
  label,
  icon,
  onClick,
  loading,
  danger,
  armed,
  armedLabel,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  danger?: boolean;
  armed?: boolean;
  armedLabel?: string;
}) {
  return (
    <Button
      variant={armed ? "danger" : danger ? "secondary" : "secondary"}
      size="sm"
      onClick={onClick}
      loading={loading}
      icon={icon}
      fullWidth
      className={cx("justify-start", danger && !armed && "!text-status-critical")}
    >
      {armed ? armedLabel : label}
    </Button>
  );
}

const STATUS_META: Record<
  DeviceCommand["status"],
  { tone: "neutral" | "good" | "warning" | "critical"; icon: React.ReactNode }
> = {
  pending: { tone: "neutral", icon: <Clock className="w-3 h-3" /> },
  sent: { tone: "warning", icon: <Clock className="w-3 h-3" /> },
  acked: { tone: "good", icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { tone: "critical", icon: <XCircle className="w-3 h-3" /> },
  expired: { tone: "critical", icon: <XCircle className="w-3 h-3" /> },
};

function CommandRow({ cmd, t }: { cmd: DeviceCommand; t: (k: string) => string }) {
  const meta = STATUS_META[cmd.status];

  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="text-content-secondary truncate">{t(`control.cmd.${cmd.command}`)}</span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-content-muted tnum">
          {new Date(cmd.issued_at).toLocaleTimeString()}
        </span>
        <Badge tone={meta.tone} icon={meta.icon}>
          {t(`control.status.${cmd.status}`)}
        </Badge>
      </span>
    </li>
  );
}
