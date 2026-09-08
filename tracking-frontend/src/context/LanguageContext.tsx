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
    'alerts.subtitle': 'Theft, impact, driving and connectivity events across your fleet',
    'no.alerts.yet': 'No alerts yet',
    'no.alerts.description': "You'll see towing, impact, power-cut, speeding and connectivity events here.",
    'mark.all.read': 'Mark all read',
    'mark.read': 'Mark read',
    'unread': 'Unread',
    'all': 'All',
    'alert.geofence_enter': 'Geofence entered',
    'alert.geofence_exit': 'Geofence exited',
    'alert.low_battery': 'Low battery',
    'alert.offline': 'Device offline',
    'alert.back_online': 'Back online',
    'alerts.critical': 'Critical',

    // PWA: install + update
    'pwa.install.title': 'Install Rad Gard',
    'pwa.install.body': 'Install the app so theft and impact alerts reach your phone even when it is closed.',
    'pwa.install.ios': 'On iPhone and iPad, notifications only work once the app is added to your Home Screen.',
    'pwa.install.ios.steps': 'Tap Share, then “Add to Home Screen”.',
    'pwa.install.action': 'Install',
    'pwa.update.title': 'A new version is ready',
    'pwa.update.body': 'Reload to get the latest version of the app.',
    'pwa.update.action': 'Reload',

    // Notifications
    'notify.title': 'Notifications',
    'notify.subtitle': 'How alerts reach you when the app is closed',
    'notify.on': 'Notifications are on for this device',
    'notify.off': 'Notifications are off for this device',
    'notify.what': 'Theft, impact, tow and power-cut alerts are delivered even when the app is closed.',
    'notify.enable': 'Turn on',
    'notify.disable': 'Turn off',
    'notify.enabled': 'Notifications enabled on this device',
    'notify.denied': 'Notifications are blocked for this site. Allow them in your browser settings, then reload.',
    'notify.denied.toast': 'Notifications are blocked in your browser settings',
    'notify.failed': 'Could not change notification settings',
    'notify.unsupported': 'This browser does not support push notifications.',
    'notify.unconfigured': 'Push notifications are not configured on this server yet.',
    'notify.ios.install': 'Add the app to your Home Screen first — iPhone and iPad only deliver notifications to an installed app.',
    'notify.test': 'Send a test notification',
    'notify.test.hint': 'Check that alerts really do arrive, before you need them to.',
    'notify.test.sent': 'Test notification sent',

    // Remote control
    'control.title': 'Remote control',
    'control.subtitle': 'Commands sent to the vehicle',
    'control.offline.note': 'The device is not reporting right now. Commands are queued and delivered when it reconnects.',
    'control.engine.cut': 'Cut engine',
    'control.engine.restore': 'Restore engine',
    'control.door.lock': 'Lock doors',
    'control.door.unlock': 'Unlock doors',
    'control.locate': 'Locate now',
    'control.reboot': 'Reboot tracker',
    'control.confirm': 'Tap again to confirm',
    'control.confirm.hint': 'Tap the button again to {action}. The engine can only be cut while the vehicle is stopped.',
    'control.recent': 'Recent commands',
    'control.none': 'No commands have been sent to this device.',
    'control.sent': 'Command sent to the vehicle',
    'control.queued': 'Queued — the device is not reachable right now',
    'control.failed': 'Could not send the command',
    'control.cmd.engine_cut': 'Cut engine',
    'control.cmd.engine_restore': 'Restore engine',
    'control.cmd.door_lock': 'Lock doors',
    'control.cmd.door_unlock': 'Unlock doors',
    'control.cmd.locate': 'Locate now',
    'control.cmd.reboot': 'Reboot tracker',
    'control.cmd.set_interval': 'Reporting interval',
    'control.status.pending': 'Queued',
    'control.status.sent': 'Sent',
    'control.status.acked': 'Confirmed',
    'control.status.failed': 'Failed',
    'control.status.expired': 'Expired',

    // Configurator
    'cfg.title': 'Alerts & configuration',
    'cfg.subtitle': 'What this device tells you about, and how loudly',
    'cfg.speed.limit': 'Speed limit',
    'cfg.speed.limit.hint': 'Alert when the vehicle goes faster than this. 0 turns the rule off.',
    'cfg.silent': 'Silent alarm',
    'cfg.silent.hint': 'Alerts are still recorded and delivered, but your phone stays quiet. SOS always makes a sound.',
    'cfg.rules': 'Alert rules',
    'cfg.sos.note': 'The SOS button cannot be switched off.',
    'cfg.save.failed': 'Could not save that setting',
    'cfg.tow': 'Towing / movement without ignition',
    'cfg.tow.hint': 'The vehicle is moving with the engine off.',
    'cfg.power': 'Vehicle power cut',
    'cfg.power.hint': 'The main supply was disconnected and the tracker is on backup.',
    'cfg.impact': 'Impact',
    'cfg.impact.hint': 'A collision-level shock was detected.',
    'cfg.jamming': 'Signal jamming',
    'cfg.jamming.hint': 'A GSM jammer may be in use nearby.',
    'cfg.overspeed': 'Overspeed',
    'cfg.overspeed.hint': 'The vehicle exceeded the speed limit above.',
    'cfg.harsh': 'Dangerous driving',
    'cfg.harsh.hint': 'Harsh acceleration, braking or cornering.',
    'cfg.ignition': 'Ignition on / off',
    'cfg.ignition.hint': 'The key was turned.',
    'cfg.geofence': 'Geofence crossings',
    'cfg.geofence.hint': 'The vehicle entered or left a zone you defined.',
    'cfg.battery': 'Low battery',
    'cfg.battery.hint': 'The vehicle battery may no longer start the engine.',
    'cfg.offline': 'Device offline',
    'cfg.offline.hint': 'The tracker stopped reporting.',

    // Plan & warranty
    'plan.title': 'Plan & warranty',
    'plan.subtitle': 'Platform access and hardware cover',
    'plan.access': 'Tracking plan',
    'plan.trial': 'Free trial',
    'plan.basic': 'Basic',
    'plan.pro': 'Pro',
    'plan.until': 'until',
    'plan.expired': 'Expired',
    'plan.days.left': '{days} days left',
    'plan.warranty': 'Warranty',
    'plan.months': '{months} months',
    'plan.covered': 'Covered',
    'plan.lapsed': 'Ended',
    'plan.expired.note': 'Renew to keep live tracking and alerts for this device.',

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

    // Odometer
    'odometer': 'Odometer',
    'odometer.total.distance': 'Total distance travelled',
    'set.odometer': 'Set odometer',
    'odometer.set.hint': 'Set the current odometer reading in kilometres',
    'kilometers.short': 'km',
    'odometer.updated': 'Odometer updated',

    // Movement history
    'history.back': 'Back to device',
    'history.title': 'Movement History',
    'history.preset.today': 'Today',
    'history.preset.yesterday': 'Yesterday',
    'history.preset.7d': 'Last 7 days',
    'history.preset.30d': 'Last 30 days',
    'history.from': 'From',
    'history.to': 'To',
    'history.stop.after': 'Count as a stop after',
    'history.stop.1min': '1 min',
    'history.stop.3min': '3 min',
    'history.stop.5min': '5 min',
    'history.stop.15min': '15 min',
    'history.apply': 'Apply',
    'history.loading': 'Loading...',
    'history.error.date.range': 'The start date must not be after the end date.',
    'history.error.load': 'Could not load history for this range.',
    'history.truncated':
      'This range holds more points than can be shown at once. The track is cut short — narrow the range to see all of it.',
    'history.summary.distance': 'Distance',
    'history.summary.driving': 'Driving',
    'history.summary.stopped': 'Stopped',
    'history.summary.max.speed': 'Max speed',
    'history.summary.stops': 'Stops',
    'history.backfill.body':
      'of {total} points were recovered from a coverage gap — buffered on the device and replayed once it reconnected. They are filed at the time they were recorded, not the time they arrived.',
    'history.route': 'Route',
    'history.no.movement': 'No movement recorded',
    'history.no.movement.hint': 'This device reported nothing between these dates.',
    'history.stops.subtitle': 'Where the vehicle stayed put, and for how long',
    'history.no.stops.threshold': 'No stops longer than the selected threshold.',
    'history.nothing.yet': 'Nothing to show yet.',
    'history.points.short': 'pts',
    'history.until': 'until',
    'history.speed.profile': 'Speed profile',
    'history.speed.profile.subtitle': 'Reported speed across the selected range',
    'history.speed.profile.aria': 'Line chart of reported speed over time for the selected range',
    'history.speed.avg': 'Average',
    'unit.km': 'km',
    'unit.kmh': 'km/h',

    // Record integrity panel
    'integrity.title': 'Record integrity',
    'integrity.subtitle': 'Whether this history can be shown to be unaltered',
    'integrity.page.subtitle': 'Verify that a device’s stored history has not been altered',
    'integrity.select.device': 'Device',
    'integrity.no.devices': 'No devices to check',
    'integrity.pick.device': 'Once you have an activated device, you can verify its records here.',
    'integrity.recheck': 'Re-check',
    'integrity.recheck.aria': 'Re-check integrity',
    'integrity.error': 'Could not verify this range.',
    'integrity.no.records': 'No records in this range to verify.',
    'integrity.row.records': 'Records in range',
    'integrity.row.covered': 'Covered by the chain',
    'integrity.row.device.signed': 'Device-signed',
    'integrity.hint.hmac': 'HMAC — provably from the device',
    'integrity.row.legacy': 'Legacy auth',
    'integrity.hint.legacy': 'Shared secret sent in clear',
    'integrity.row.backfilled': 'Backfilled',
    'integrity.hint.backfilled': 'Recovered from a coverage gap',
    'integrity.row.not.covered': 'Not covered',
    'integrity.hint.not.covered': 'Stored before chaining began',
    'integrity.tamper.begins':
      'Tampering begins at record #{id}. Everything recorded before it is still verifiable.',
    'integrity.download': 'Download certificate',
    'integrity.public.key': 'Public key',
    'integrity.cert.note':
      'The certificate is signed with Ed25519 and can be checked by anyone holding the public key — no account here required.',
    'integrity.verdict.altered.title': 'Records were altered',
    'integrity.verdict.altered.body':
      'The stored hashes no longer match the data. This history should not be relied on as evidence.',
    'integrity.verdict.partial.title': 'Partially verifiable',
    'integrity.verdict.partial.body':
      '{covered} record(s) verify correctly. The rest were stored before tamper-evident recording was switched on, so nothing can be proven about them either way.',
    'integrity.verdict.ok.title': 'Verified unaltered',
    'integrity.verdict.ok.body':
      'Every record hashes correctly and links to the one before it. Nothing has been edited, removed or reordered since it was stored.',
    'integrity.badge.verified': 'Verified',
    'integrity.badge.altered': 'Altered',

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
    'alerts.subtitle': 'رویدادهای سرقت، ضربه، رانندگی و اتصال در ناوگان شما',
    'no.alerts.yet': 'هنوز هشداری وجود ندارد',
    'no.alerts.description': 'رویدادهای بکسل، ضربه، قطع برق، سرعت غیرمجاز و اتصال در اینجا نمایش داده می‌شوند.',
    'mark.all.read': 'علامت‌گذاری همه به‌عنوان خوانده‌شده',
    'mark.read': 'خوانده شد',
    'unread': 'خوانده‌نشده',
    'all': 'همه',
    'alert.geofence_enter': 'ورود به محدوده',
    'alert.geofence_exit': 'خروج از محدوده',
    'alert.low_battery': 'باتری کم',
    'alert.offline': 'دستگاه آفلاین شد',
    'alert.back_online': 'بازگشت به آنلاین',
    'alerts.critical': 'بحرانی',

    // PWA: نصب و به‌روزرسانی
    'pwa.install.title': 'نصب ردگَرد',
    'pwa.install.body': 'برنامه را نصب کنید تا هشدارهای سرقت و ضربه حتی وقتی برنامه بسته است به گوشی شما برسد.',
    'pwa.install.ios': 'در آیفون و آیپد، اعلان‌ها فقط پس از افزودن برنامه به صفحهٔ اصلی کار می‌کنند.',
    'pwa.install.ios.steps': 'روی Share بزنید، سپس «Add to Home Screen».',
    'pwa.install.action': 'نصب',
    'pwa.update.title': 'نسخهٔ جدید آماده است',
    'pwa.update.body': 'برای دریافت آخرین نسخهٔ برنامه، صفحه را بارگذاری مجدد کنید.',
    'pwa.update.action': 'بارگذاری مجدد',

    // اعلان‌ها
    'notify.title': 'اعلان‌ها',
    'notify.subtitle': 'اینکه هشدارها وقتی برنامه بسته است چگونه به شما می‌رسند',
    'notify.on': 'اعلان‌ها روی این دستگاه فعال است',
    'notify.off': 'اعلان‌ها روی این دستگاه غیرفعال است',
    'notify.what': 'هشدارهای سرقت، ضربه، بکسل و قطع برق حتی با بستهٔ بودن برنامه ارسال می‌شوند.',
    'notify.enable': 'فعال‌سازی',
    'notify.disable': 'غیرفعال‌سازی',
    'notify.enabled': 'اعلان‌ها روی این دستگاه فعال شد',
    'notify.denied': 'اعلان‌ها برای این سایت مسدود شده‌اند. از تنظیمات مرورگر اجازه دهید و صفحه را دوباره بارگذاری کنید.',
    'notify.denied.toast': 'اعلان‌ها در تنظیمات مرورگر شما مسدود شده‌اند',
    'notify.failed': 'تغییر تنظیمات اعلان ممکن نشد',
    'notify.unsupported': 'این مرورگر از اعلان‌های وب پشتیبانی نمی‌کند.',
    'notify.unconfigured': 'اعلان‌های وب هنوز روی این سرور پیکربندی نشده‌اند.',
    'notify.ios.install': 'ابتدا برنامه را به صفحهٔ اصلی اضافه کنید — آیفون و آیپد فقط به برنامهٔ نصب‌شده اعلان می‌دهند.',
    'notify.test': 'ارسال اعلان آزمایشی',
    'notify.test.hint': 'پیش از آنکه به آن نیاز پیدا کنید، مطمئن شوید هشدارها واقعاً می‌رسند.',
    'notify.test.sent': 'اعلان آزمایشی ارسال شد',

    // کنترل از راه دور
    'control.title': 'کنترل از راه دور',
    'control.subtitle': 'فرمان‌های ارسال‌شده به خودرو',
    'control.offline.note': 'دستگاه در حال حاضر گزارشی ارسال نمی‌کند. فرمان‌ها در صف می‌مانند و پس از اتصال مجدد ارسال می‌شوند.',
    'control.engine.cut': 'قطع موتور',
    'control.engine.restore': 'وصل موتور',
    'control.door.lock': 'قفل درها',
    'control.door.unlock': 'بازکردن درها',
    'control.locate': 'موقعیت‌یابی فوری',
    'control.reboot': 'راه‌اندازی مجدد ردیاب',
    'control.confirm': 'برای تأیید دوباره بزنید',
    'control.confirm.hint': 'برای {action} دوباره روی دکمه بزنید. موتور فقط در حالت توقف خودرو قابل قطع است.',
    'control.recent': 'فرمان‌های اخیر',
    'control.none': 'هیچ فرمانی برای این دستگاه ارسال نشده است.',
    'control.sent': 'فرمان به خودرو ارسال شد',
    'control.queued': 'در صف — دستگاه در حال حاضر در دسترس نیست',
    'control.failed': 'ارسال فرمان ممکن نشد',
    'control.cmd.engine_cut': 'قطع موتور',
    'control.cmd.engine_restore': 'وصل موتور',
    'control.cmd.door_lock': 'قفل درها',
    'control.cmd.door_unlock': 'بازکردن درها',
    'control.cmd.locate': 'موقعیت‌یابی فوری',
    'control.cmd.reboot': 'راه‌اندازی مجدد ردیاب',
    'control.cmd.set_interval': 'بازهٔ گزارش‌دهی',
    'control.status.pending': 'در صف',
    'control.status.sent': 'ارسال‌شده',
    'control.status.acked': 'تأییدشده',
    'control.status.failed': 'ناموفق',
    'control.status.expired': 'منقضی‌شده',

    // پیکربندی
    'cfg.title': 'هشدارها و پیکربندی',
    'cfg.subtitle': 'اینکه این دستگاه چه چیزی را و با چه شدتی به شما اطلاع دهد',
    'cfg.speed.limit': 'محدودیت سرعت',
    'cfg.speed.limit.hint': 'هشدار هنگام عبور خودرو از این سرعت. مقدار ۰ این قانون را غیرفعال می‌کند.',
    'cfg.silent': 'هشدار بی‌صدا',
    'cfg.silent.hint': 'هشدارها همچنان ثبت و ارسال می‌شوند، اما گوشی شما صدایی نمی‌دهد. SOS همیشه صدا دارد.',
    'cfg.rules': 'قوانین هشدار',
    'cfg.sos.note': 'دکمهٔ SOS قابل غیرفعال‌کردن نیست.',
    'cfg.save.failed': 'ذخیرهٔ این تنظیم ممکن نشد',
    'cfg.tow': 'بکسل / حرکت بدون سوئیچ',
    'cfg.tow.hint': 'خودرو با موتور خاموش در حال حرکت است.',
    'cfg.power': 'قطع برق خودرو',
    'cfg.power.hint': 'برق اصلی قطع شده و ردیاب روی باتری پشتیبان کار می‌کند.',
    'cfg.impact': 'ضربه',
    'cfg.impact.hint': 'ضربه‌ای در حد تصادف شناسایی شد.',
    'cfg.jamming': 'اختلال (جمر)',
    'cfg.jamming.hint': 'ممکن است در نزدیکی از جمر GSM استفاده شود.',
    'cfg.overspeed': 'تجاوز از سرعت',
    'cfg.overspeed.hint': 'خودرو از محدودیت سرعت بالا عبور کرد.',
    'cfg.harsh': 'رانندگی پرخطر',
    'cfg.harsh.hint': 'شتاب، ترمز یا پیچش شدید.',
    'cfg.ignition': 'روشن / خاموش شدن سوئیچ',
    'cfg.ignition.hint': 'سوئیچ چرخانده شد.',
    'cfg.geofence': 'عبور از محدوده',
    'cfg.geofence.hint': 'خودرو وارد یکی از محدوده‌های تعریف‌شدهٔ شما شد یا از آن خارج شد.',
    'cfg.battery': 'باتری کم',
    'cfg.battery.hint': 'ممکن است باتری خودرو دیگر موتور را روشن نکند.',
    'cfg.offline': 'آفلاین شدن دستگاه',
    'cfg.offline.hint': 'ردیاب گزارش‌دهی را متوقف کرد.',

    // اشتراک و گارانتی
    'plan.title': 'اشتراک و گارانتی',
    'plan.subtitle': 'دسترسی به سامانه و پوشش سخت‌افزار',
    'plan.access': 'اشتراک ردیابی',
    'plan.trial': 'دورهٔ رایگان',
    'plan.basic': 'پایه',
    'plan.pro': 'حرفه‌ای',
    'plan.until': 'تا',
    'plan.expired': 'منقضی‌شده',
    'plan.days.left': '{days} روز باقی‌مانده',
    'plan.warranty': 'گارانتی',
    'plan.months': '{months} ماه',
    'plan.covered': 'تحت پوشش',
    'plan.lapsed': 'پایان‌یافته',
    'plan.expired.note': 'برای حفظ ردیابی زنده و هشدارهای این دستگاه، اشتراک را تمدید کنید.',

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

    // Odometer
    'odometer': 'کیلومترشمار',
    'odometer.total.distance': 'مسافت کل پیموده‌شده',
    'set.odometer': 'تنظیم کیلومترشمار',
    'odometer.set.hint': 'مقدار فعلی کیلومترشمار را برحسب کیلومتر وارد کنید',
    'kilometers.short': 'کیلومتر',
    'odometer.updated': 'کیلومترشمار به‌روزرسانی شد',

    // Movement history
    'history.back': 'بازگشت به دستگاه',
    'history.title': 'تاریخچه حرکت',
    'history.preset.today': 'امروز',
    'history.preset.yesterday': 'دیروز',
    'history.preset.7d': '۷ روز اخیر',
    'history.preset.30d': '۳۰ روز اخیر',
    'history.from': 'از تاریخ',
    'history.to': 'تا تاریخ',
    'history.stop.after': 'ثبت به‌عنوان توقف پس از',
    'history.stop.1min': '۱ دقیقه',
    'history.stop.3min': '۳ دقیقه',
    'history.stop.5min': '۵ دقیقه',
    'history.stop.15min': '۱۵ دقیقه',
    'history.apply': 'اعمال',
    'history.loading': 'در حال بارگذاری...',
    'history.error.date.range': 'تاریخ شروع نباید بعد از تاریخ پایان باشد.',
    'history.error.load': 'بارگذاری تاریخچه برای این بازه ممکن نشد.',
    'history.truncated':
      'این بازه شامل نقاطی بیش از حد نمایش هم‌زمان است. مسیر کوتاه شده است — برای دیدن کامل آن، بازه را محدودتر کنید.',
    'history.summary.distance': 'مسافت',
    'history.summary.driving': 'رانندگی',
    'history.summary.stopped': 'توقف',
    'history.summary.max.speed': 'حداکثر سرعت',
    'history.summary.stops': 'توقف‌ها',
    'history.backfill.body':
      'نقطه از مجموع {total} نقطه از یک وقفهٔ پوششی بازیابی شدند — روی دستگاه ذخیره و پس از اتصال مجدد بازپخش شدند. این نقاط با زمان ثبت واقعی‌شان درج می‌شوند، نه زمان دریافت.',
    'history.route': 'مسیر',
    'history.no.movement': 'حرکتی ثبت نشده است',
    'history.no.movement.hint': 'این دستگاه در این بازهٔ زمانی داده‌ای ارسال نکرده است.',
    'history.stops.subtitle': 'جایی که خودرو متوقف بوده و مدت آن',
    'history.no.stops.threshold': 'هیچ توقفی طولانی‌تر از آستانهٔ انتخاب‌شده وجود ندارد.',
    'history.nothing.yet': 'هنوز چیزی برای نمایش نیست.',
    'history.points.short': 'نقطه',
    'history.until': 'تا',
    'history.speed.profile': 'نمودار سرعت',
    'history.speed.profile.subtitle': 'سرعت گزارش‌شده در بازهٔ انتخاب‌شده',
    'history.speed.profile.aria': 'نمودار خطی سرعت گزارش‌شده در طول زمان برای بازهٔ انتخاب‌شده',
    'history.speed.avg': 'میانگین',
    'unit.km': 'کیلومتر',
    'unit.kmh': 'کیلومتر بر ساعت',

    // Record integrity panel
    'integrity.title': 'یکپارچگی سوابق',
    'integrity.subtitle': 'اینکه آیا می‌توان اثبات کرد این تاریخچه دستکاری نشده است',
    'integrity.page.subtitle': 'بررسی کنید که تاریخچهٔ ذخیره‌شدهٔ یک دستگاه دستکاری نشده باشد',
    'integrity.select.device': 'دستگاه',
    'integrity.no.devices': 'دستگاهی برای بررسی وجود ندارد',
    'integrity.pick.device': 'پس از فعال‌سازی یک دستگاه، می‌توانید سوابق آن را در اینجا بررسی کنید.',
    'integrity.recheck': 'بررسی مجدد',
    'integrity.recheck.aria': 'بررسی مجدد یکپارچگی',
    'integrity.error': 'بررسی این بازه ممکن نشد.',
    'integrity.no.records': 'هیچ سابقه‌ای در این بازه برای بررسی وجود ندارد.',
    'integrity.row.records': 'سوابق در بازه',
    'integrity.row.covered': 'تحت پوشش زنجیره',
    'integrity.row.device.signed': 'امضاشده توسط دستگاه',
    'integrity.hint.hmac': 'HMAC — قابل‌اثبات از سوی دستگاه',
    'integrity.row.legacy': 'احراز هویت قدیمی',
    'integrity.hint.legacy': 'کلید مشترک به‌صورت متن ساده ارسال شده',
    'integrity.row.backfilled': 'بازیابی‌شده',
    'integrity.hint.backfilled': 'بازیابی‌شده از یک وقفهٔ پوششی',
    'integrity.row.not.covered': 'خارج از پوشش',
    'integrity.hint.not.covered': 'پیش از آغاز زنجیره‌سازی ذخیره شده',
    'integrity.tamper.begins':
      'دستکاری از سابقهٔ #{id} آغاز می‌شود. همهٔ سوابق ثبت‌شده پیش از آن هنوز قابل‌راستی‌آزمایی هستند.',
    'integrity.download': 'دانلود گواهی',
    'integrity.public.key': 'کلید عمومی',
    'integrity.cert.note':
      'گواهی با Ed25519 امضا شده و هر کسی که کلید عمومی را داشته باشد می‌تواند آن را بررسی کند — نیازی به حساب کاربری در اینجا نیست.',
    'integrity.verdict.altered.title': 'سوابق دستکاری شده‌اند',
    'integrity.verdict.altered.body':
      'هش‌های ذخیره‌شده دیگر با داده‌ها مطابقت ندارند. نباید به این تاریخچه به‌عنوان مدرک اتکا کرد.',
    'integrity.verdict.partial.title': 'تا حدی قابل‌راستی‌آزمایی',
    'integrity.verdict.partial.body':
      '{covered} سابقه به‌درستی راستی‌آزمایی می‌شوند. بقیه پیش از فعال‌شدن ثبتِ مقاوم در برابر دستکاری ذخیره شده‌اند، بنابراین دربارهٔ آن‌ها چیزی قابل‌اثبات نیست.',
    'integrity.verdict.ok.title': 'راستی‌آزمایی‌شده و بدون تغییر',
    'integrity.verdict.ok.body':
      'هر سابقه به‌درستی هش می‌شود و به سابقهٔ پیش از خود پیوند دارد. از زمان ذخیره‌سازی چیزی ویرایش، حذف یا جابه‌جا نشده است.',
    'integrity.badge.verified': 'راستی‌آزمایی‌شد',
    'integrity.badge.altered': 'دستکاری‌شده',

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