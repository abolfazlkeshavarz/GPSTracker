import { useEffect, useState } from "react";
import { Download, RefreshCw, Share, X } from "lucide-react";

import { isIOS, isStandalone, onInstallAvailable, promptInstall } from "../../lib/pwa";
import { useLanguage } from "../../context/LanguageContext";
import { Button, cx } from "../ui";

/*
Install and update prompts.

Installing is not cosmetic here. On iOS, Web Push works ONLY from an installed
app — a tracker running in a Safari tab cannot notify anyone that their car is
being towed. So the prompt explains that reason rather than saying "add to
home screen", and iOS gets its own copy because there is no
`beforeinstallprompt` to raise: it has to be done through the Share menu.

Both banners are dismissible and remember the dismissal, because a nag bar on
a safety app is a reason to stop opening it.
*/

const INSTALL_DISMISSED_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const { t } = useLanguage();

  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
    } catch {
      // Private mode / blocked storage: show the prompt rather than crash.
      return false;
    }
  });

  const ios = isIOS();
  const standalone = isStandalone();

  useEffect(() => onInstallAvailable(setAvailable), []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // Dismissal just will not persist; the banner is still gone this session.
    }
  };

  // Already installed, dismissed, or the browser has nothing to offer and this
  // is not the iOS case where we can still give instructions.
  if (standalone || dismissed) return null;
  if (!available && !(ios && !standalone)) return null;

  return (
    <div className="mb-4 flex items-start gap-3 p-3 rounded-card border border-brand/25 bg-brand-subtle">
      <span className="grid place-items-center w-9 h-9 rounded-control bg-brand text-white shrink-0">
        <Download className="w-[18px] h-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content">{t("pwa.install.title")}</p>
        <p className="text-xs text-content-secondary mt-0.5">
          {ios ? t("pwa.install.ios") : t("pwa.install.body")}
        </p>

        {ios ? (
          <p className="flex items-center gap-1.5 text-xs text-content-muted mt-2">
            <Share className="w-3.5 h-3.5" />
            {t("pwa.install.ios.steps")}
          </p>
        ) : (
          <Button
            size="sm"
            className="mt-2"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={async () => {
              const accepted = await promptInstall();
              if (!accepted) dismiss();
            }}
          >
            {t("pwa.install.action")}
          </Button>
        )}
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label={t("cancel")}
        className="grid place-items-center w-7 h-7 rounded-control text-content-muted hover:bg-surface-sunken cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Shown when a new build is waiting.
 *
 * Fixed rather than inline: an update can become available at any moment,
 * including while the user is on a page that has no room for a banner.
 */
export function UpdatePrompt({ onReload }: { onReload: () => Promise<void> }) {
  const { t } = useLanguage();
  const [reloading, setReloading] = useState(false);

  return (
    <div
      role="status"
      className={cx(
        "fixed z-50 inset-x-3 bottom-20 lg:bottom-4 lg:inset-x-auto lg:end-4 lg:w-80",
        "flex items-start gap-3 p-3 rounded-card bg-surface-raised border border-line shadow-lg"
      )}
    >
      <span className="grid place-items-center w-9 h-9 rounded-control bg-brand-subtle text-brand-ink shrink-0">
        <RefreshCw className="w-[18px] h-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content">{t("pwa.update.title")}</p>
        <p className="text-xs text-content-muted mt-0.5">{t("pwa.update.body")}</p>

        <Button
          size="sm"
          className="mt-2"
          loading={reloading}
          onClick={async () => {
            setReloading(true);
            await onReload();
          }}
        >
          {t("pwa.update.action")}
        </Button>
      </div>
    </div>
  );
}
