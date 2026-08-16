// src/components/LanguageSwitcher.tsx
import { useLanguage } from '../context/LanguageContext';
import { Languages } from 'lucide-react';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  const next = language === 'en' ? 'fa' : 'en';
  const label = language === 'en' ? 'فارسی' : 'English';

  return (
    <button
      onClick={() => setLanguage(next)}
      // The button shows the language it switches *to*, so the title says so
      // explicitly rather than leaving it ambiguous.
      title={language === 'en' ? 'تغییر به فارسی' : 'Switch to English'}
      aria-label={language === 'en' ? 'Switch to Persian' : 'Switch to English'}
      className="flex items-center gap-1.5 px-2.5 h-8 rounded-control border border-line text-xs font-medium text-content-secondary hover:bg-surface-sunken transition-colors"
    >
      <Languages className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}
