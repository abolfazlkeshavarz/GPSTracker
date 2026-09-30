// src/components/LanguageSwitcher.tsx
import { Languages } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { LANGUAGES, type Language } from '../i18n/languages';

/**
 * Language picker. A native <select> rather than a toggle now that there are
 * three languages: it is keyboard and screen-reader friendly for free, and
 * each option is labelled in its own language so anyone can find theirs.
 */
export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <label className="relative flex items-center gap-1.5 px-2.5 h-8 rounded-control border border-line text-xs font-medium text-content-secondary hover:bg-surface-sunken transition-colors cursor-pointer">
      <Languages className="w-4 h-4" aria-hidden />
      <span className="sr-only">Language / زبان / Lingua</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="bg-transparent outline-none cursor-pointer appearance-none pe-1"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
