export type Language = 'en' | 'fa' | 'it';

/** Each language is labelled in itself, so anyone can find their own. */
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fa', label: 'فارسی' },
  { code: 'it', label: 'Italiano' },
];
