// src/context/LanguageContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'fa';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const translations = {
  en: {
    // Common
    'gps.tracker': 'Rad Gard',
    'realtime.fleet': 'Real-time Fleet Management',
    'online': 'Online',
    'offline': 'Offline',
    'logout': 'Logout',
    'dashboard': 'Dashboard',
    'activate.device': 'Activate Device',
    'register.success': 'Registration was successful!',

    
    // Dashboard
    'dashboard.overview': 'Dashboard Overview',
    'real.time.monitoring': 'Real-time monitoring of your fleet',
    'total.devices': 'Total Devices',
    'online.devices': 'Online Devices',
    'offline.devices': 'Offline Devices',
    'active.today': 'Active Today',
    'your.devices': 'Your Devices',
    'add.new.device': 'Add New Device',
    'no.devices.yet': 'No Devices Yet',
    'activate.first.tracker': 'Activate your first GPS tracker to start monitoring',
    'websocket.connection': 'WebSocket Connection',
    'live.updates.active': 'Live Updates Active',
    'reconnecting': 'Reconnecting...',
    
    // Device Card
    'gps.tracker.device': 'GPS Tracker Device',
    'location': 'Location',
    'speed': 'Speed',
    'speed.unit':'Km/H',
    'satellites': 'Satellites',
    'signal': 'Signal',
    'battery': 'Battery',
    'no.data.yet': 'No data yet',
    
    // Device Details
    'device.details': 'Device Details',
    'view.history': 'View History',
    'serial': 'Serial',
    'live.updates': 'Live Updates',
    'connecting': 'Connecting...',
    'last.update': 'Last update',
    'speed.realtime': 'Current velocity',
    'satellites.in.view': 'in view',
    'signal.strength': 'Signal Strength',
    'battery.voltage': 'volts',
    'location.details': 'Location Details',
    'latitude': 'Latitude',
    'longitude': 'Longitude',
    'network.operator': 'Network Operator',
    'ignition': 'Ignition',
    'performance.metrics': 'Performance Metrics',
    'gps.accuracy': 'GPS Accuracy',
    'data.quality': 'Data Quality',
    'update.frequency': 'Update Frequency',
    'live.location.tracking': 'Live Location Tracking',
    'last.known.position': 'Last known position',
    'excellent': 'Excellent',
    'good': 'Good',
    'fair': 'Fair',
    'poor': 'Poor',
    'very.poor': 'Very Poor',
    'low': 'Low',
    'critical': 'Critical',
    'no.fix': 'No Fix',
    'high': 'High',
    'medium': 'Medium',
    'real.time': 'Real-time',
    
    // Activate Device
    'activate.device.title': 'Activate Device',
    'add.new.gps.tracker': 'Add a new GPS tracker to your account',
    'device.registration': 'Device Registration',
    'enter.device.credentials': 'Enter your device credentials',
    'serial.number': 'Serial Number',
    'enter.device.serial': 'Enter device serial (e.g., TEST003)',
    'serial.hint': 'The serial number is printed on your GPS device label',
    'device.secret.key': 'Device Secret Key',
    'enter.device.secret': 'Enter device secret key',
    'secret.hint': 'The secret key is provided with your device',
    'activating': 'Activating...',
    'activate': 'Activate Device',
    'security.note': 'Security Note',
    'security.note.text': 'The secret key is required to authenticate your device. Keep it secure and never share it.',
    'need.help': 'Need help?',
    'help.line1': 'Make sure your device is powered on',
    'help.line2': 'Check that the serial number and secret are correct',
    'help.line3': 'Contact support if you continue having issues',
    'activation.success': 'Device activated successfully!',
    'redirecting': 'Redirecting to dashboard...',
    
    // Login
    'welcome.back': 'Welcome back!',
    'phone.number': 'Phone Number',
    'password': 'Password',
    'sign.in': 'Sign In',
    'dont.have.account': "Don't have an account?",
    'create.account': 'Create Account',
    
    // Register
    'create.account.title': 'Create Account',
    'join.gps.tracker': 'Join RadGard today',
    'create.account.btn': 'Create Account',
    'already.have.account': 'Already have an account?',
    
    // Status
    'online.status': 'Online',
    'offline.status': 'Offline',
    'inactive': 'Inactive',
    
    // Buttons
    'activate.btn': 'Activate',
    'cancel': 'Cancel',
    'save': 'Save',
    'delete': 'Delete',
    'edit': 'Edit',
    
    // Messages
    'loading': 'Loading...',
    'no.data.available': 'No Data Available',
    'no.location.data': 'No location data found for device',
    'login.failed': 'Login failed',
    'register.failed': 'Registration failed',
    'please.enter.serial': 'Please enter a device serial number',
    'please.enter.secret': 'Please enter the device secret key',

    // Alerts
    'alerts': 'Alerts',
    'alerts.subtitle': 'Geofence crossings, low battery and connectivity events across your fleet',
    'no.alerts.yet': 'No alerts yet',
    'no.alerts.description': "You'll see geofence crossings, low-battery and connectivity events here.",
    'mark.all.read': 'Mark all read',
    'mark.read': 'Mark read',
    'unread': 'Unread',
    'all': 'All',
    'alert.geofence_enter': 'Geofence entered',
    'alert.geofence_exit': 'Geofence exited',
    'alert.low_battery': 'Low battery',
    'alert.offline': 'Device offline',
    'alert.back_online': 'Back online',

    // Account
    'account': 'Account',
    'account.subtitle': 'Manage your profile and password',
    'profile': 'Profile',
    'phone': 'Phone',
    'role': 'Role',
    'member.since': 'Member since',
    'change.password': 'Change Password',
    'current.password': 'Current Password',
    'new.password': 'New Password',
    'confirm.new.password': 'Confirm New Password',
    'update.password': 'Update Password',
    'password.updated': 'Password updated successfully',
    'passwords.dont.match': 'New passwords do not match',
    'password.too.short': 'New password must be at least 6 characters',

    // Device customization
    'rename.device': 'Rename device',
    'device.name.placeholder': 'e.g. Dad\'s Car',
    'unnamed.device': 'Unnamed device',

    // Export
    'export.csv': 'Export CSV',
    'export.history': 'Export history',

    // Geofences
    'geofences': 'Geofences',
    'geofences.subtitle': 'Get alerted the moment this device enters or leaves a zone',
    'add.geofence': 'Add geofence',
    'geofence.name': 'Zone name',
    'geofence.name.placeholder': 'e.g. Home, Office, Warehouse',
    'radius': 'Radius',
    'trigger.on': 'Alert on',
    'trigger.enter': 'Entering',
    'trigger.exit': 'Leaving',
    'trigger.both': 'Entering & leaving',
    'use.current.location': 'Use current location',
    'no.geofences.yet': 'No geofences yet',
    'no.geofences.description': 'Add a zone around this device\'s current location to get alerted on crossings.',
    'active': 'Active',
    'paused': 'Paused',
    'pause': 'Pause',
    'resume': 'Resume',
    'meters': 'm',
  },
  fa: {
    // Common
    'gps.tracker': 'ردگَرد',
    'realtime.fleet': 'مدیریت بلادرنگ ناوگان شما',
    'online': 'آنلاین',
    'offline': 'آفلاین',
    'logout': 'خروج',
    'dashboard': 'داشبورد',
    'activate.device': 'فعال‌سازی دستگاه',
    'register.success': 'ثبت نام موفقیت آمیز بود',

    
    // Dashboard
    'dashboard.overview': 'نمای کلی داشبورد',
    'real.time.monitoring': 'نظارت بلادرنگ بر ناوگان شما',
    'total.devices': 'تعداد دستگاه‌ها',
    'online.devices': 'دستگاه‌های آنلاین',
    'offline.devices': 'دستگاه‌های آفلاین',
    'active.today': 'فعال امروز',
    'your.devices': 'دستگاه‌های شما',
    'add.new.device': 'افزودن دستگاه جدید',
    'no.devices.yet': 'هنوز دستگاهی وجود ندارد',
    'activate.first.tracker': 'اولین ردیاب جی‌پی‌اس خود را برای شروع نظارت فعال کنید',
    'websocket.connection': 'اتصال وب‌سوکت',
    'live.updates.active': 'به‌روزرسانی زنده فعال است',
    'reconnecting': 'در حال اتصال مجدد...',
    
    // Device Card
    'gps.tracker.device': 'دستگاه ردیاب جی‌پی‌اس',
    'location': 'موقعیت',
    'speed': 'سرعت',
    'speed.unit':'کیلومتر بر ساعت',
    'satellites': 'ماهواره‌ها',
    'signal': 'سیگنال',
    'battery': 'باتری',
    'no.data.yet': 'هنوز داده‌ای وجود ندارد',
    
    // Device Details
    'device.details': 'جزئیات دستگاه',
    'view.history': 'مشاهده تاریخچه',
    'serial': 'سریال',
    'live.updates': 'به‌روزرسانی زنده',
    'connecting': 'در حال اتصال...',
    'last.update': 'آخرین به‌روزرسانی',
    'speed.realtime': 'سرعت فعلی',
    'satellites.in.view': 'ماهواره در محدوده',
    'signal.strength': 'قدرت سیگنال',
    'battery.voltage': 'ولت',
    'location.details': 'جزئیات موقعیت',
    'latitude': 'عرض جغرافیایی',
    'longitude': 'طول جغرافیایی',
    'network.operator': 'اپراتور شبکه',
    'ignition': 'اشتعال',
    'performance.metrics': 'معیارهای عملکرد',
    'gps.accuracy': 'دقت جی‌پی‌اس',
    'data.quality': 'کیفیت داده',
    'update.frequency': 'فرکانس به‌روزرسانی',
    'live.location.tracking': 'ردیابی موقعیت زنده',
    'last.known.position': 'آخرین موقعیت شناخته شده',
    'excellent': 'عالی',
    'good': 'خوب',
    'fair': 'متوسط',
    'poor': 'ضعیف',
    'very.poor': 'بسیار ضعیف',
    'low': 'کم',
    'critical': 'بحرانی',
    'no.fix': 'بدون موقعیت',
    'high': 'بالا',
    'medium': 'متوسط',
    'real.time': 'بلادرنگ',
    
    // Activate Device
    'activate.device.title': 'فعال‌سازی دستگاه',
    'add.new.gps.tracker': 'افزودن ردیاب جی‌پی‌اس جدید به حساب کاربری',
    'device.registration': 'ثبت دستگاه',
    'enter.device.credentials': 'اطلاعات دستگاه را وارد کنید',
    'serial.number': 'شماره سریال',
    'enter.device.serial': 'شماره سریال دستگاه را وارد کنید (مثال: TEST003)',
    'serial.hint': 'شماره سریال روی برچسب دستگاه جی‌پی‌اس شما درج شده است',
    'device.secret.key': 'کلید مخفی دستگاه',
    'enter.device.secret': 'کلید مخفی دستگاه را وارد کنید',
    'secret.hint': 'کلید مخفی همراه دستگاه ارائه می‌شود',
    'activating': 'در حال فعال‌سازی...',
    'activate': 'فعال‌سازی دستگاه',
    'security.note': 'نکته امنیتی',
    'security.note.text': 'کلید مخفی برای احراز هویت دستگاه الزامی است. آن را ایمن نگه دارید و هرگز به اشتراک نگذارید.',
    'need.help': 'نیاز به کمک دارید؟',
    'help.line1': 'مطمئن شوید دستگاه شما روشن است',
    'help.line2': 'بررسی کنید شماره سریال و کلید مخفی صحیح باشند',
    'help.line3': 'در صورت ادامه مشکل با پشتیبانی تماس بگیرید',
    'activation.success': 'دستگاه با موفقیت فعال شد!',
    'redirecting': 'در حال انتقال به داشبورد...',
    
    // Login
    'welcome.back': 'خوش آمدید!',
    'phone.number': 'شماره تلفن',
    'password': 'رمز عبور',
    'sign.in': 'ورود',
    'dont.have.account': 'حساب کاربری ندارید؟',
    'create.account': 'ایجاد حساب',
    
    // Register
    'create.account.title': 'ایجاد حساب',
    'join.gps.tracker': 'به ردگَرد بپیوندید',
    'create.account.btn': 'ایجاد حساب',
    'already.have.account': 'حساب کاربری دارید؟',
    
    // Status
    'online.status': 'آنلاین',
    'offline.status': 'آفلاین',
    'inactive': 'غیرفعال',
    
    // Buttons
    'activate.btn': 'فعال‌سازی',
    'cancel': 'انصراف',
    'save': 'ذخیره',
    'delete': 'حذف',
    'edit': 'ویرایش',
    
    // Messages
    'loading': 'در حال بارگذاری...',
    'no.data.available': 'داده‌ای موجود نیست',
    'no.location.data': 'داده موقعیتی برای دستگاه یافت نشد',
    'login.failed': 'ورود ناموفق بود',
    'register.failed': 'ثبت‌نام ناموفق بود',
    'please.enter.serial': 'لطفاً شماره سریال دستگاه را وارد کنید',
    'please.enter.secret': 'لطفاً کلید دستگاه را وارد کنید',

    // Alerts
    'alerts': 'هشدارها',
    'alerts.subtitle': 'رویدادهای ورود و خروج از محدوده، باتری کم و قطعی اتصال در ناوگان شما',
    'no.alerts.yet': 'هنوز هشداری وجود ندارد',
    'no.alerts.description': 'رویدادهای ورود و خروج از محدوده، باتری کم و اتصال در اینجا نمایش داده می‌شوند.',
    'mark.all.read': 'علامت‌گذاری همه به‌عنوان خوانده‌شده',
    'mark.read': 'خوانده شد',
    'unread': 'خوانده‌نشده',
    'all': 'همه',
    'alert.geofence_enter': 'ورود به محدوده',
    'alert.geofence_exit': 'خروج از محدوده',
    'alert.low_battery': 'باتری کم',
    'alert.offline': 'دستگاه آفلاین شد',
    'alert.back_online': 'بازگشت به آنلاین',

    // Account
    'account': 'حساب کاربری',
    'account.subtitle': 'مدیریت پروفایل و رمز عبور خود',
    'profile': 'پروفایل',
    'phone': 'شماره تلفن',
    'role': 'نقش',
    'member.since': 'عضویت از',
    'change.password': 'تغییر رمز عبور',
    'current.password': 'رمز عبور فعلی',
    'new.password': 'رمز عبور جدید',
    'confirm.new.password': 'تکرار رمز عبور جدید',
    'update.password': 'به‌روزرسانی رمز عبور',
    'password.updated': 'رمز عبور با موفقیت به‌روزرسانی شد',
    'passwords.dont.match': 'رمزهای عبور جدید یکسان نیستند',
    'password.too.short': 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد',

    // Device customization
    'rename.device': 'تغییر نام دستگاه',
    'device.name.placeholder': 'مثال: ماشین بابا',
    'unnamed.device': 'دستگاه بدون نام',

    // Export
    'export.csv': 'خروجی CSV',
    'export.history': 'خروجی تاریخچه',

    // Geofences
    'geofences': 'محدوده‌های جغرافیایی',
    'geofences.subtitle': 'به‌محض ورود یا خروج این دستگاه از یک محدوده مطلع شوید',
    'add.geofence': 'افزودن محدوده',
    'geofence.name': 'نام محدوده',
    'geofence.name.placeholder': 'مثال: خانه، محل کار، انبار',
    'radius': 'شعاع',
    'trigger.on': 'هشدار هنگام',
    'trigger.enter': 'ورود',
    'trigger.exit': 'خروج',
    'trigger.both': 'ورود و خروج',
    'use.current.location': 'استفاده از موقعیت فعلی',
    'no.geofences.yet': 'هنوز محدوده‌ای تعریف نشده است',
    'no.geofences.description': 'برای دریافت هشدار، محدوده‌ای اطراف موقعیت فعلی این دستگاه اضافه کنید.',
    'active': 'فعال',
    'paused': 'متوقف‌شده',
    'pause': 'توقف',
    'resume': 'ازسرگیری',
    'meters': 'متر',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved === 'fa' ? 'fa' : 'en') as Language;
  });

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    
    // Apply font class for Persian
    if (language === 'fa') {
      document.documentElement.classList.add('font-vazir');
      document.body.style.fontFamily = 'Vazir, sans-serif';
    } else {
      document.documentElement.classList.remove('font-vazir');
      document.body.style.fontFamily = '';
    }
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations.en] || key;
  };

  const isRTL = language === 'fa';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}