// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class LEn extends L {
  LEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Rad Gard';

  @override
  String get tagline => 'Your vehicle, always within reach.';

  @override
  String get phone => 'Phone number';

  @override
  String get password => 'Password';

  @override
  String get confirmPassword => 'Confirm password';

  @override
  String get signIn => 'Sign in';

  @override
  String get createAccount => 'Create account';

  @override
  String get noAccount => 'New here? Create an account';

  @override
  String get haveAccount => 'Already have an account? Sign in';

  @override
  String get passwordTooShort => 'Password must be at least 8 characters';

  @override
  String get passwordsDontMatch => 'Passwords do not match';

  @override
  String get invalidPhone => 'Enter a valid phone number';

  @override
  String get invalidCredentials => 'Wrong phone number or password';

  @override
  String get accountExists => 'An account with this number already exists';

  @override
  String get accountCreated => 'Account created. Sign in to continue.';

  @override
  String get server => 'Server';

  @override
  String get serverSettings => 'Server connection';

  @override
  String get serverUrl => 'Server address';

  @override
  String get serverUrlHelp =>
      'The address of your tracking platform, e.g. https://example.com';

  @override
  String get mapTiles => 'Map tile source';

  @override
  String get mapTilesHelp =>
      'Leave empty to use your platform\'s own map server, or enter a URL template with z, x and y.';

  @override
  String get testConnection => 'Test connection';

  @override
  String get connectionOk => 'Server reachable';

  @override
  String get connectionFailed => 'Could not reach the server';

  @override
  String get invalidUrl => 'Enter a valid https:// address';

  @override
  String get insecureUrl =>
      'Only https:// servers are allowed in release builds';

  @override
  String get serverChangedRelogin => 'Server changed. Please sign in again.';

  @override
  String get restoreDefaults => 'Restore defaults';

  @override
  String get save => 'Save';

  @override
  String get cancel => 'Cancel';

  @override
  String get delete => 'Delete';

  @override
  String get retry => 'Retry';

  @override
  String get close => 'Close';

  @override
  String get settings => 'Settings';

  @override
  String get language => 'Language';

  @override
  String get appearance => 'Appearance';

  @override
  String get themeSystem => 'System';

  @override
  String get themeLight => 'Light';

  @override
  String get themeDark => 'Dark';

  @override
  String get security => 'Security';

  @override
  String get appLock => 'Biometric lock';

  @override
  String get appLockDesc =>
      'Require fingerprint, face or device PIN to open the app';

  @override
  String get appLockUnavailable =>
      'No biometric or device lock is set up on this phone';

  @override
  String get unlockReason => 'Unlock to view your vehicles';

  @override
  String get unlock => 'Unlock';

  @override
  String get locked => 'Locked';

  @override
  String get account => 'Account';

  @override
  String get changePassword => 'Change password';

  @override
  String get currentPassword => 'Current password';

  @override
  String get newPassword => 'New password';

  @override
  String get passwordChanged => 'Password updated';

  @override
  String get wrongCurrentPassword => 'Current password is incorrect';

  @override
  String get logout => 'Sign out';

  @override
  String get logoutConfirm => 'Sign out of this phone?';

  @override
  String get about => 'About';

  @override
  String version(String v) {
    return 'Version $v';
  }

  @override
  String get notifications => 'Notifications';

  @override
  String get notificationsDesc =>
      'Show alerts from your vehicles as phone notifications';

  @override
  String get garage => 'Garage';

  @override
  String get noDevices => 'No trackers yet';

  @override
  String get noDevicesHint =>
      'Add the tracker installed in your vehicle using the serial and secret on its label.';

  @override
  String get addDevice => 'Add tracker';

  @override
  String get serial => 'Serial number';

  @override
  String get deviceSecret => 'Device secret';

  @override
  String get activate => 'Activate';

  @override
  String activated(String days) {
    return 'Tracker added. $days days of service included.';
  }

  @override
  String get deviceNotFound => 'No tracker with this serial';

  @override
  String get wrongSecret => 'The device secret is incorrect';

  @override
  String get alreadyActivated => 'This tracker is already registered';

  @override
  String get online => 'Online';

  @override
  String get offline => 'Offline';

  @override
  String get moving => 'Moving';

  @override
  String get parked => 'Parked';

  @override
  String get idling => 'Engine on';

  @override
  String get noSignalYet => 'Waiting for first position';

  @override
  String get justNow => 'just now';

  @override
  String minutesAgo(String n) {
    return '$n min ago';
  }

  @override
  String hoursAgo(String n) {
    return '$n h ago';
  }

  @override
  String daysAgo(String n) {
    return '$n d ago';
  }

  @override
  String get speed => 'Speed';

  @override
  String get kmh => 'km/h';

  @override
  String get km => 'km';

  @override
  String get satellites => 'Satellites';

  @override
  String get cellSignal => 'Cell signal';

  @override
  String get battery => 'Vehicle battery';

  @override
  String get ignition => 'Ignition';

  @override
  String get on => 'On';

  @override
  String get off => 'Off';

  @override
  String get heading => 'Heading';

  @override
  String get altitude => 'Altitude';

  @override
  String get gpsAccuracy => 'GPS accuracy';

  @override
  String get extPower => 'External power';

  @override
  String get connected => 'Connected';

  @override
  String get disconnected => 'Cut';

  @override
  String get jamming => 'Jamming';

  @override
  String get detected => 'Detected';

  @override
  String get clear => 'Clear';

  @override
  String get operator => 'Operator';

  @override
  String get odometer => 'Odometer';

  @override
  String get setOdometer => 'Set odometer';

  @override
  String get odometerHint => 'Match the reading on your dashboard';

  @override
  String get health => 'Tracker health';

  @override
  String get healthExcellent => 'Excellent';

  @override
  String get healthGood => 'Good';

  @override
  String get healthFair => 'Fair';

  @override
  String get healthPoor => 'Poor';

  @override
  String get sensors => 'What this tracker reports';

  @override
  String get live => 'Live';

  @override
  String get journey => 'Journey';

  @override
  String get control => 'Control';

  @override
  String get alerts => 'Alerts';

  @override
  String get zones => 'Zones';

  @override
  String get today => 'Today';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get pickDate => 'Pick a day';

  @override
  String get distance => 'Distance';

  @override
  String get drivingTime => 'Driving';

  @override
  String get parkedTime => 'Parked';

  @override
  String get maxSpeed => 'Top speed';

  @override
  String get avgSpeed => 'Avg speed';

  @override
  String get noJourney => 'No movement recorded on this day';

  @override
  String get truncated => 'Too many points; showing the first part of the day';

  @override
  String get trip => 'Trip';

  @override
  String get stop => 'Stop';

  @override
  String get replay => 'Replay';

  @override
  String get backfill => 'Delivered late (no coverage)';

  @override
  String get remoteControl => 'Remote control';

  @override
  String get engineCut => 'Cut engine';

  @override
  String get engineRestore => 'Restore engine';

  @override
  String get doorLock => 'Lock doors';

  @override
  String get doorUnlock => 'Unlock doors';

  @override
  String get locate => 'Locate now';

  @override
  String get reboot => 'Restart tracker';

  @override
  String get slideToConfirm => 'Slide to confirm';

  @override
  String get engineCutWarning =>
      'The engine will only be cut when the vehicle is below 10 km/h. Use it for a stolen vehicle.';

  @override
  String get commandSent => 'Sent to the vehicle';

  @override
  String get commandQueued => 'Queued: the vehicle is not reachable right now';

  @override
  String get commandRefusedMoving => 'Refused: the vehicle is moving';

  @override
  String get recentCommands => 'Recent commands';

  @override
  String get statusPending => 'Pending';

  @override
  String get statusSent => 'Sent';

  @override
  String get statusAcked => 'Confirmed';

  @override
  String get statusFailed => 'Failed';

  @override
  String get statusExpired => 'Expired';

  @override
  String get guardMode => 'Guard mode';

  @override
  String get guardModeDesc =>
      'Alert me the moment the vehicle leaves where it is parked now';

  @override
  String guardArmed(String m) {
    return 'Armed — watching a $m m circle';
  }

  @override
  String get guardNeedsFix => 'Needs a current position';

  @override
  String get markAllRead => 'Mark all read';

  @override
  String get noAlerts => 'All quiet. No alerts.';

  @override
  String get alertImpact => 'Impact detected';

  @override
  String get alertSos => 'SOS pressed';

  @override
  String get alertPowerCut => 'Vehicle power cut';

  @override
  String get alertPowerRestored => 'Vehicle power restored';

  @override
  String get alertTow => 'Possible towing';

  @override
  String get alertJamming => 'Signal jamming';

  @override
  String get alertOverspeed => 'Speed limit exceeded';

  @override
  String get alertLowBattery => 'Low vehicle battery';

  @override
  String get alertOffline => 'Tracker stopped reporting';

  @override
  String get alertBackOnline => 'Tracker back online';

  @override
  String get alertGeofenceEnter => 'Entered a zone';

  @override
  String get alertGeofenceExit => 'Left a zone';

  @override
  String get alertIgnitionOn => 'Engine started';

  @override
  String get alertIgnitionOff => 'Engine stopped';

  @override
  String get alertHarshAccel => 'Harsh acceleration';

  @override
  String get alertHarshBrake => 'Harsh braking';

  @override
  String get alertHarshCorner => 'Sharp cornering';

  @override
  String get alertSubExpiring => 'Service plan ending soon';

  @override
  String get alertSubExpired => 'Service plan expired';

  @override
  String get alertGeneric => 'Vehicle alert';

  @override
  String get newZone => 'New zone';

  @override
  String get zoneName => 'Zone name';

  @override
  String get radius => 'Radius';

  @override
  String meters(String m) {
    return '$m m';
  }

  @override
  String get triggerOn => 'Alert when';

  @override
  String get triggerEnter => 'Arrives';

  @override
  String get triggerExit => 'Leaves';

  @override
  String get triggerBoth => 'Both';

  @override
  String get zoneHint => 'Long-press the map to place the centre';

  @override
  String get noZones =>
      'No zones yet. Add home or work to know when the vehicle arrives or leaves.';

  @override
  String deleteZoneConfirm(String name) {
    return 'Delete zone \"$name\"?';
  }

  @override
  String get vehicleSettings => 'Vehicle settings';

  @override
  String get rename => 'Rename';

  @override
  String get vehicleName => 'Vehicle name';

  @override
  String get speedLimit => 'Speed limit alert';

  @override
  String get speedLimitOff => 'Off';

  @override
  String get reportInterval => 'Reporting interval';

  @override
  String seconds(String n) {
    return '$n s';
  }

  @override
  String get silentMode => 'Silent mode';

  @override
  String get silentModeDesc => 'Record alerts without notifying';

  @override
  String get alertTypes => 'Alert types';

  @override
  String get saved => 'Saved';

  @override
  String get findMyCar => 'Walk to my car';

  @override
  String awayFromYou(String d) {
    return '$d away';
  }

  @override
  String get locationDenied =>
      'Allow location access to guide you to the vehicle';

  @override
  String get exportCsv => 'Export history (CSV)';

  @override
  String get subscription => 'Service plan';

  @override
  String daysLeft(String n) {
    return '$n days left';
  }

  @override
  String get expired => 'Expired';

  @override
  String get warranty => 'Warranty';

  @override
  String get networkError => 'No connection to the server';

  @override
  String get sessionExpired => 'Your session expired. Please sign in again.';

  @override
  String get somethingWrong => 'Something went wrong';

  @override
  String get showingCached => 'Offline — showing last known data';

  @override
  String get realtimeOn => 'Live';

  @override
  String get realtimeOff => 'Reconnecting…';

  @override
  String get notReported => 'Not reported';

  @override
  String volts(String v) {
    return '$v V';
  }

  @override
  String get filterAll => 'All';

  @override
  String get filterUnread => 'Unread';

  @override
  String get severityCritical => 'Critical';

  @override
  String get severityWarning => 'Warning';

  @override
  String get severityInfo => 'Info';
}
