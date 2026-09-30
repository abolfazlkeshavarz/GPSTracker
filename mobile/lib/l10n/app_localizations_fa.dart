// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Persian (`fa`).
class LFa extends L {
  LFa([String locale = 'fa']) : super(locale);

  @override
  String get appName => 'ردگَرد';

  @override
  String get tagline => 'خودروی شما، همیشه در دسترس.';

  @override
  String get phone => 'شماره تلفن';

  @override
  String get password => 'رمز عبور';

  @override
  String get confirmPassword => 'تکرار رمز عبور';

  @override
  String get signIn => 'ورود';

  @override
  String get createAccount => 'ساخت حساب';

  @override
  String get noAccount => 'حساب ندارید؟ ثبت‌نام کنید';

  @override
  String get haveAccount => 'حساب دارید؟ وارد شوید';

  @override
  String get passwordTooShort => 'رمز عبور باید حداقل ۸ کاراکتر باشد';

  @override
  String get passwordsDontMatch => 'رمزهای عبور یکسان نیستند';

  @override
  String get invalidPhone => 'یک شماره تلفن معتبر وارد کنید';

  @override
  String get invalidCredentials => 'شماره تلفن یا رمز عبور اشتباه است';

  @override
  String get accountExists => 'حسابی با این شماره وجود دارد';

  @override
  String get accountCreated => 'حساب ساخته شد. برای ادامه وارد شوید.';

  @override
  String get server => 'سرور';

  @override
  String get serverSettings => 'اتصال سرور';

  @override
  String get serverUrl => 'آدرس سرور';

  @override
  String get serverUrlHelp => 'آدرس پلتفرم ردیابی، مثلاً https://example.com';

  @override
  String get mapTiles => 'منبع کاشی نقشه';

  @override
  String get mapTilesHelp =>
      'برای استفاده از سرور نقشه پلتفرم خالی بگذارید، یا الگوی آدرس با z، x و y وارد کنید.';

  @override
  String get testConnection => 'آزمایش اتصال';

  @override
  String get connectionOk => 'سرور در دسترس است';

  @override
  String get connectionFailed => 'اتصال به سرور ممکن نشد';

  @override
  String get invalidUrl => 'یک آدرس https:// معتبر وارد کنید';

  @override
  String get insecureUrl => 'در نسخه نهایی فقط سرورهای https:// مجاز هستند';

  @override
  String get serverChangedRelogin => 'سرور تغییر کرد. لطفاً دوباره وارد شوید.';

  @override
  String get restoreDefaults => 'بازگردانی پیش‌فرض';

  @override
  String get save => 'ذخیره';

  @override
  String get cancel => 'انصراف';

  @override
  String get delete => 'حذف';

  @override
  String get retry => 'تلاش دوباره';

  @override
  String get close => 'بستن';

  @override
  String get settings => 'تنظیمات';

  @override
  String get language => 'زبان';

  @override
  String get appearance => 'ظاهر';

  @override
  String get themeSystem => 'سیستم';

  @override
  String get themeLight => 'روشن';

  @override
  String get themeDark => 'تیره';

  @override
  String get security => 'امنیت';

  @override
  String get appLock => 'قفل بیومتریک';

  @override
  String get appLockDesc =>
      'برای باز کردن برنامه اثر انگشت، چهره یا رمز دستگاه لازم باشد';

  @override
  String get appLockUnavailable =>
      'هیچ قفل بیومتریک یا رمزی روی این گوشی تنظیم نشده است';

  @override
  String get unlockReason => 'برای مشاهده خودروها قفل را باز کنید';

  @override
  String get unlock => 'باز کردن قفل';

  @override
  String get locked => 'قفل است';

  @override
  String get account => 'حساب کاربری';

  @override
  String get changePassword => 'تغییر رمز عبور';

  @override
  String get currentPassword => 'رمز عبور فعلی';

  @override
  String get newPassword => 'رمز عبور جدید';

  @override
  String get passwordChanged => 'رمز عبور به‌روز شد';

  @override
  String get wrongCurrentPassword => 'رمز عبور فعلی نادرست است';

  @override
  String get logout => 'خروج';

  @override
  String get logoutConfirm => 'از این گوشی خارج می‌شوید؟';

  @override
  String get about => 'درباره';

  @override
  String version(String v) {
    return 'نسخه $v';
  }

  @override
  String get notifications => 'اعلان‌ها';

  @override
  String get notificationsDesc =>
      'هشدارهای خودرو را به صورت اعلان گوشی نمایش بده';

  @override
  String get garage => 'پارکینگ';

  @override
  String get noDevices => 'هنوز ردیابی ندارید';

  @override
  String get noDevicesHint =>
      'ردیاب نصب‌شده در خودرو را با سریال و رمز روی برچسب آن اضافه کنید.';

  @override
  String get addDevice => 'افزودن ردیاب';

  @override
  String get serial => 'شماره سریال';

  @override
  String get deviceSecret => 'رمز دستگاه';

  @override
  String get activate => 'فعال‌سازی';

  @override
  String activated(String days) {
    return 'ردیاب اضافه شد. $days روز سرویس رایگان.';
  }

  @override
  String get deviceNotFound => 'ردیابی با این سریال وجود ندارد';

  @override
  String get wrongSecret => 'رمز دستگاه نادرست است';

  @override
  String get alreadyActivated => 'این ردیاب قبلاً ثبت شده است';

  @override
  String get online => 'آنلاین';

  @override
  String get offline => 'آفلاین';

  @override
  String get moving => 'در حرکت';

  @override
  String get parked => 'پارک';

  @override
  String get idling => 'روشن و متوقف';

  @override
  String get noSignalYet => 'در انتظار اولین موقعیت';

  @override
  String get justNow => 'همین حالا';

  @override
  String minutesAgo(String n) {
    return '$n دقیقه پیش';
  }

  @override
  String hoursAgo(String n) {
    return '$n ساعت پیش';
  }

  @override
  String daysAgo(String n) {
    return '$n روز پیش';
  }

  @override
  String get speed => 'سرعت';

  @override
  String get kmh => 'کیلومتر/ساعت';

  @override
  String get km => 'کیلومتر';

  @override
  String get satellites => 'ماهواره';

  @override
  String get cellSignal => 'آنتن موبایل';

  @override
  String get battery => 'باتری خودرو';

  @override
  String get ignition => 'سوئیچ';

  @override
  String get on => 'روشن';

  @override
  String get off => 'خاموش';

  @override
  String get heading => 'جهت';

  @override
  String get altitude => 'ارتفاع';

  @override
  String get gpsAccuracy => 'دقت GPS';

  @override
  String get extPower => 'برق خودرو';

  @override
  String get connected => 'وصل';

  @override
  String get disconnected => 'قطع';

  @override
  String get jamming => 'پارازیت';

  @override
  String get detected => 'شناسایی شد';

  @override
  String get clear => 'ندارد';

  @override
  String get operator => 'اپراتور';

  @override
  String get odometer => 'کیلومترشمار';

  @override
  String get setOdometer => 'تنظیم کیلومترشمار';

  @override
  String get odometerHint => 'با عدد روی داشبورد خودرو یکسان کنید';

  @override
  String get health => 'سلامت ردیاب';

  @override
  String get healthExcellent => 'عالی';

  @override
  String get healthGood => 'خوب';

  @override
  String get healthFair => 'متوسط';

  @override
  String get healthPoor => 'ضعیف';

  @override
  String get sensors => 'داده‌هایی که این ردیاب ارسال می‌کند';

  @override
  String get live => 'زنده';

  @override
  String get journey => 'سفرها';

  @override
  String get control => 'کنترل';

  @override
  String get alerts => 'هشدارها';

  @override
  String get zones => 'محدوده‌ها';

  @override
  String get today => 'امروز';

  @override
  String get yesterday => 'دیروز';

  @override
  String get pickDate => 'انتخاب روز';

  @override
  String get distance => 'مسافت';

  @override
  String get drivingTime => 'رانندگی';

  @override
  String get parkedTime => 'توقف';

  @override
  String get maxSpeed => 'حداکثر سرعت';

  @override
  String get avgSpeed => 'سرعت میانگین';

  @override
  String get noJourney => 'در این روز حرکتی ثبت نشده است';

  @override
  String get truncated => 'نقاط زیاد است؛ بخش اول روز نمایش داده می‌شود';

  @override
  String get trip => 'سفر';

  @override
  String get stop => 'توقف';

  @override
  String get replay => 'بازپخش';

  @override
  String get backfill => 'با تأخیر رسید (بدون پوشش)';

  @override
  String get remoteControl => 'کنترل از راه دور';

  @override
  String get engineCut => 'قطع موتور';

  @override
  String get engineRestore => 'وصل موتور';

  @override
  String get doorLock => 'قفل درها';

  @override
  String get doorUnlock => 'باز کردن درها';

  @override
  String get locate => 'مکان‌یابی فوری';

  @override
  String get reboot => 'راه‌اندازی مجدد ردیاب';

  @override
  String get slideToConfirm => 'برای تأیید بکشید';

  @override
  String get engineCutWarning =>
      'موتور فقط وقتی سرعت زیر ۱۰ کیلومتر بر ساعت باشد قطع می‌شود. برای خودروی سرقتی استفاده کنید.';

  @override
  String get commandSent => 'به خودرو ارسال شد';

  @override
  String get commandQueued => 'در صف: خودرو اکنون در دسترس نیست';

  @override
  String get commandRefusedMoving => 'رد شد: خودرو در حال حرکت است';

  @override
  String get recentCommands => 'فرمان‌های اخیر';

  @override
  String get statusPending => 'در انتظار';

  @override
  String get statusSent => 'ارسال شد';

  @override
  String get statusAcked => 'تأیید شد';

  @override
  String get statusFailed => 'ناموفق';

  @override
  String get statusExpired => 'منقضی';

  @override
  String get guardMode => 'حالت نگهبان';

  @override
  String get guardModeDesc =>
      'به محض خروج خودرو از محل پارک فعلی به من هشدار بده';

  @override
  String guardArmed(String m) {
    return 'فعال — مراقبت از دایره $m متری';
  }

  @override
  String get guardNeedsFix => 'موقعیت فعلی لازم است';

  @override
  String get markAllRead => 'همه خوانده شد';

  @override
  String get noAlerts => 'همه چیز آرام است. هشداری نیست.';

  @override
  String get alertImpact => 'ضربه شناسایی شد';

  @override
  String get alertSos => 'دکمه اضطراری فشرده شد';

  @override
  String get alertPowerCut => 'برق خودرو قطع شد';

  @override
  String get alertPowerRestored => 'برق خودرو وصل شد';

  @override
  String get alertTow => 'احتمال یدک‌کشی';

  @override
  String get alertJamming => 'پارازیت سیگنال';

  @override
  String get alertOverspeed => 'عبور از حد سرعت';

  @override
  String get alertLowBattery => 'باتری خودرو ضعیف است';

  @override
  String get alertOffline => 'ردیاب ارسال را متوقف کرد';

  @override
  String get alertBackOnline => 'ردیاب دوباره آنلاین شد';

  @override
  String get alertGeofenceEnter => 'ورود به محدوده';

  @override
  String get alertGeofenceExit => 'خروج از محدوده';

  @override
  String get alertIgnitionOn => 'موتور روشن شد';

  @override
  String get alertIgnitionOff => 'موتور خاموش شد';

  @override
  String get alertHarshAccel => 'شتاب ناگهانی';

  @override
  String get alertHarshBrake => 'ترمز ناگهانی';

  @override
  String get alertHarshCorner => 'پیچ تند';

  @override
  String get alertSubExpiring => 'اشتراک به زودی تمام می‌شود';

  @override
  String get alertSubExpired => 'اشتراک تمام شده است';

  @override
  String get alertGeneric => 'هشدار خودرو';

  @override
  String get newZone => 'محدوده جدید';

  @override
  String get zoneName => 'نام محدوده';

  @override
  String get radius => 'شعاع';

  @override
  String meters(String m) {
    return '$m متر';
  }

  @override
  String get triggerOn => 'هشدار هنگام';

  @override
  String get triggerEnter => 'ورود';

  @override
  String get triggerExit => 'خروج';

  @override
  String get triggerBoth => 'هر دو';

  @override
  String get zoneHint => 'برای تعیین مرکز روی نقشه نگه دارید';

  @override
  String get noZones => 'هنوز محدوده‌ای ندارید. خانه یا محل کار را اضافه کنید.';

  @override
  String deleteZoneConfirm(String name) {
    return 'محدوده «$name» حذف شود؟';
  }

  @override
  String get vehicleSettings => 'تنظیمات خودرو';

  @override
  String get rename => 'تغییر نام';

  @override
  String get vehicleName => 'نام خودرو';

  @override
  String get speedLimit => 'هشدار حد سرعت';

  @override
  String get speedLimitOff => 'خاموش';

  @override
  String get reportInterval => 'فاصله ارسال';

  @override
  String seconds(String n) {
    return '$n ثانیه';
  }

  @override
  String get silentMode => 'حالت بی‌صدا';

  @override
  String get silentModeDesc => 'هشدارها ثبت شوند ولی اعلان داده نشود';

  @override
  String get alertTypes => 'انواع هشدار';

  @override
  String get saved => 'ذخیره شد';

  @override
  String get findMyCar => 'مسیر پیاده تا خودرو';

  @override
  String awayFromYou(String d) {
    return '$d فاصله';
  }

  @override
  String get locationDenied =>
      'برای راهنمایی تا خودرو، دسترسی به موقعیت را مجاز کنید';

  @override
  String get exportCsv => 'خروجی تاریخچه (CSV)';

  @override
  String get subscription => 'طرح سرویس';

  @override
  String daysLeft(String n) {
    return '$n روز مانده';
  }

  @override
  String get expired => 'منقضی شده';

  @override
  String get warranty => 'گارانتی';

  @override
  String get networkError => 'ارتباط با سرور برقرار نیست';

  @override
  String get sessionExpired => 'نشست شما منقضی شد. دوباره وارد شوید.';

  @override
  String get somethingWrong => 'مشکلی پیش آمد';

  @override
  String get showingCached => 'آفلاین — آخرین داده‌های ذخیره‌شده';

  @override
  String get realtimeOn => 'زنده';

  @override
  String get realtimeOff => 'در حال اتصال دوباره…';

  @override
  String get notReported => 'گزارش نشده';

  @override
  String volts(String v) {
    return '$v ولت';
  }

  @override
  String get filterAll => 'همه';

  @override
  String get filterUnread => 'خوانده‌نشده';

  @override
  String get severityCritical => 'بحرانی';

  @override
  String get severityWarning => 'هشدار';

  @override
  String get severityInfo => 'اطلاع';
}
