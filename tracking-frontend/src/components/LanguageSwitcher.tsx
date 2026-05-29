// src/components/LanguageSwitcher.tsx
import { useLanguage } from '../context/LanguageContext';
import { Languages } from 'lucide-react';

export default function LanguageSwitcher() {
  const { language, setLanguage, t, isRTL } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'en' ? 'fa' : 'en')}
      className="flex items-center space-x-2 rtl:space-x-reverse px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200"
      title={language === 'en' ? 'تغییر به فارسی' : 'Switch to English'}
    >
      <Languages className="w-4 h-4 text-gray-600" />
      <span className="text-sm font-medium text-gray-700">
        {language === 'en' ? 'فارسی' : 'English'}
      </span>
    </button>
  );
}