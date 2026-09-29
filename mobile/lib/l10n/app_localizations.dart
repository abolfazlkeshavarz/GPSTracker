import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fa.dart';
import 'app_localizations_it.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of L
/// returned by `L.of(context)`.
///
/// Applications need to include `L.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: L.localizationsDelegates,
///   supportedLocales: L.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the L.supportedLocales
/// property.
abstract class L {
  L(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static L of(BuildContext context) {
    return Localizations.of<L>(context, L)!;
  }

  static const LocalizationsDelegate<L> delegate = _LDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('fa'),
    Locale('it'),
  ];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'GPSTracker'**
  String get appName;

  /// No description provided for @tagline.
  ///
  /// In en, this message translates to:
  /// **'Your vehicle, always within reach.'**
  String get tagline;

  /// No description provided for @phone.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get phone;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @confirmPassword.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get confirmPassword;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signIn;

  /// No description provided for @createAccount.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get createAccount;

  /// No description provided for @noAccount.
  ///
  /// In en, this message translates to:
  /// **'New here? Create an account'**
  String get noAccount;

  /// No description provided for @haveAccount.
  ///
  /// In en, this message translates to:
  /// **'Already have an account? Sign in'**
  String get haveAccount;

  /// No description provided for @passwordTooShort.
  ///
  /// In en, this message translates to:
  /// **'Password must be at least 8 characters'**
  String get passwordTooShort;

  /// No description provided for @passwordsDontMatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match'**
  String get passwordsDontMatch;

  /// No description provided for @invalidPhone.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid phone number'**
  String get invalidPhone;

  /// No description provided for @invalidCredentials.
  ///
  /// In en, this message translates to:
  /// **'Wrong phone number or password'**
  String get invalidCredentials;

  /// No description provided for @accountExists.
  ///
  /// In en, this message translates to:
  /// **'An account with this number already exists'**
  String get accountExists;

  /// No description provided for @accountCreated.
  ///
  /// In en, this message translates to:
  /// **'Account created. Sign in to continue.'**
  String get accountCreated;

  /// No description provided for @server.
  ///
  /// In en, this message translates to:
  /// **'Server'**
  String get server;

  /// No description provided for @serverSettings.
  ///
  /// In en, this message translates to:
  /// **'Server connection'**
  String get serverSettings;

  /// No description provided for @serverUrl.
  ///
  /// In en, this message translates to:
  /// **'Server address'**
  String get serverUrl;

  /// No description provided for @serverUrlHelp.
  ///
  /// In en, this message translates to:
  /// **'The address of your tracking platform, e.g. https://example.com'**
  String get serverUrlHelp;

  /// No description provided for @mapTiles.
  ///
  /// In en, this message translates to:
  /// **'Map tile source'**
  String get mapTiles;

  /// No description provided for @mapTilesHelp.
  ///
  /// In en, this message translates to:
  /// **'URL template containing the z, x and y tile placeholders'**
  String get mapTilesHelp;

  /// No description provided for @testConnection.
  ///
  /// In en, this message translates to:
  /// **'Test connection'**
  String get testConnection;

  /// No description provided for @connectionOk.
  ///
  /// In en, this message translates to:
  /// **'Server reachable'**
  String get connectionOk;

  /// No description provided for @connectionFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not reach the server'**
  String get connectionFailed;

  /// No description provided for @invalidUrl.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid https:// address'**
  String get invalidUrl;

  /// No description provided for @insecureUrl.
  ///
  /// In en, this message translates to:
  /// **'Only https:// servers are allowed in release builds'**
  String get insecureUrl;

  /// No description provided for @serverChangedRelogin.
  ///
  /// In en, this message translates to:
  /// **'Server changed. Please sign in again.'**
  String get serverChangedRelogin;

  /// No description provided for @restoreDefaults.
  ///
  /// In en, this message translates to:
  /// **'Restore defaults'**
  String get restoreDefaults;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @delete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get delete;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @appearance.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get appearance;

  /// No description provided for @themeSystem.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get themeSystem;

  /// No description provided for @themeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get themeLight;

  /// No description provided for @themeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get themeDark;

  /// No description provided for @security.
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get security;

  /// No description provided for @appLock.
  ///
  /// In en, this message translates to:
  /// **'Biometric lock'**
  String get appLock;

  /// No description provided for @appLockDesc.
  ///
  /// In en, this message translates to:
  /// **'Require fingerprint, face or device PIN to open the app'**
  String get appLockDesc;

  /// No description provided for @appLockUnavailable.
  ///
  /// In en, this message translates to:
  /// **'No biometric or device lock is set up on this phone'**
  String get appLockUnavailable;

  /// No description provided for @unlockReason.
  ///
  /// In en, this message translates to:
  /// **'Unlock to view your vehicles'**
  String get unlockReason;

  /// No description provided for @unlock.
  ///
  /// In en, this message translates to:
  /// **'Unlock'**
  String get unlock;

  /// No description provided for @locked.
  ///
  /// In en, this message translates to:
  /// **'Locked'**
  String get locked;

  /// No description provided for @account.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get account;

  /// No description provided for @changePassword.
  ///
  /// In en, this message translates to:
  /// **'Change password'**
  String get changePassword;

  /// No description provided for @currentPassword.
  ///
  /// In en, this message translates to:
  /// **'Current password'**
  String get currentPassword;

  /// No description provided for @newPassword.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get newPassword;

  /// No description provided for @passwordChanged.
  ///
  /// In en, this message translates to:
  /// **'Password updated'**
  String get passwordChanged;

  /// No description provided for @wrongCurrentPassword.
  ///
  /// In en, this message translates to:
  /// **'Current password is incorrect'**
  String get wrongCurrentPassword;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get logout;

  /// No description provided for @logoutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Sign out of this phone?'**
  String get logoutConfirm;

  /// No description provided for @about.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get about;

  /// No description provided for @version.
  ///
  /// In en, this message translates to:
  /// **'Version {v}'**
  String version(String v);

  /// No description provided for @notifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notifications;

  /// No description provided for @notificationsDesc.
  ///
  /// In en, this message translates to:
  /// **'Show alerts from your vehicles as phone notifications'**
  String get notificationsDesc;

  /// No description provided for @garage.
  ///
  /// In en, this message translates to:
  /// **'Garage'**
  String get garage;

  /// No description provided for @noDevices.
  ///
  /// In en, this message translates to:
  /// **'No trackers yet'**
  String get noDevices;

  /// No description provided for @noDevicesHint.
  ///
  /// In en, this message translates to:
  /// **'Add the tracker installed in your vehicle using the serial and secret on its label.'**
  String get noDevicesHint;

  /// No description provided for @addDevice.
  ///
  /// In en, this message translates to:
  /// **'Add tracker'**
  String get addDevice;

  /// No description provided for @serial.
  ///
  /// In en, this message translates to:
  /// **'Serial number'**
  String get serial;

  /// No description provided for @deviceSecret.
  ///
  /// In en, this message translates to:
  /// **'Device secret'**
  String get deviceSecret;

  /// No description provided for @activate.
  ///
  /// In en, this message translates to:
  /// **'Activate'**
  String get activate;

  /// No description provided for @activated.
  ///
  /// In en, this message translates to:
  /// **'Tracker added. {days} days of service included.'**
  String activated(String days);

  /// No description provided for @deviceNotFound.
  ///
  /// In en, this message translates to:
  /// **'No tracker with this serial'**
  String get deviceNotFound;

  /// No description provided for @wrongSecret.
  ///
  /// In en, this message translates to:
  /// **'The device secret is incorrect'**
  String get wrongSecret;

  /// No description provided for @alreadyActivated.
  ///
  /// In en, this message translates to:
  /// **'This tracker is already registered'**
  String get alreadyActivated;

  /// No description provided for @online.
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get online;

  /// No description provided for @offline.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get offline;

  /// No description provided for @moving.
  ///
  /// In en, this message translates to:
  /// **'Moving'**
  String get moving;

  /// No description provided for @parked.
  ///
  /// In en, this message translates to:
  /// **'Parked'**
  String get parked;

  /// No description provided for @idling.
  ///
  /// In en, this message translates to:
  /// **'Engine on'**
  String get idling;

  /// No description provided for @noSignalYet.
  ///
  /// In en, this message translates to:
  /// **'Waiting for first position'**
  String get noSignalYet;

  /// No description provided for @justNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get justNow;

  /// No description provided for @minutesAgo.
  ///
  /// In en, this message translates to:
  /// **'{n} min ago'**
  String minutesAgo(String n);

  /// No description provided for @hoursAgo.
  ///
  /// In en, this message translates to:
  /// **'{n} h ago'**
  String hoursAgo(String n);

  /// No description provided for @daysAgo.
  ///
  /// In en, this message translates to:
  /// **'{n} d ago'**
  String daysAgo(String n);

  /// No description provided for @speed.
  ///
  /// In en, this message translates to:
  /// **'Speed'**
  String get speed;

  /// No description provided for @kmh.
  ///
  /// In en, this message translates to:
  /// **'km/h'**
  String get kmh;

  /// No description provided for @km.
  ///
  /// In en, this message translates to:
  /// **'km'**
  String get km;

  /// No description provided for @satellites.
  ///
  /// In en, this message translates to:
  /// **'Satellites'**
  String get satellites;

  /// No description provided for @cellSignal.
  ///
  /// In en, this message translates to:
  /// **'Cell signal'**
  String get cellSignal;

  /// No description provided for @battery.
  ///
  /// In en, this message translates to:
  /// **'Vehicle battery'**
  String get battery;

  /// No description provided for @ignition.
  ///
  /// In en, this message translates to:
  /// **'Ignition'**
  String get ignition;

  /// No description provided for @on.
  ///
  /// In en, this message translates to:
  /// **'On'**
  String get on;

  /// No description provided for @off.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get off;

  /// No description provided for @heading.
  ///
  /// In en, this message translates to:
  /// **'Heading'**
  String get heading;

  /// No description provided for @altitude.
  ///
  /// In en, this message translates to:
  /// **'Altitude'**
  String get altitude;

  /// No description provided for @gpsAccuracy.
  ///
  /// In en, this message translates to:
  /// **'GPS accuracy'**
  String get gpsAccuracy;

  /// No description provided for @extPower.
  ///
  /// In en, this message translates to:
  /// **'External power'**
  String get extPower;

  /// No description provided for @connected.
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get connected;

  /// No description provided for @disconnected.
  ///
  /// In en, this message translates to:
  /// **'Cut'**
  String get disconnected;

  /// No description provided for @jamming.
  ///
  /// In en, this message translates to:
  /// **'Jamming'**
  String get jamming;

  /// No description provided for @detected.
  ///
  /// In en, this message translates to:
  /// **'Detected'**
  String get detected;

  /// No description provided for @clear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clear;

  /// No description provided for @operator.
  ///
  /// In en, this message translates to:
  /// **'Operator'**
  String get operator;

  /// No description provided for @odometer.
  ///
  /// In en, this message translates to:
  /// **'Odometer'**
  String get odometer;

  /// No description provided for @setOdometer.
  ///
  /// In en, this message translates to:
  /// **'Set odometer'**
  String get setOdometer;

  /// No description provided for @odometerHint.
  ///
  /// In en, this message translates to:
  /// **'Match the reading on your dashboard'**
  String get odometerHint;

  /// No description provided for @health.
  ///
  /// In en, this message translates to:
  /// **'Tracker health'**
  String get health;

  /// No description provided for @healthExcellent.
  ///
  /// In en, this message translates to:
  /// **'Excellent'**
  String get healthExcellent;

  /// No description provided for @healthGood.
  ///
  /// In en, this message translates to:
  /// **'Good'**
  String get healthGood;

  /// No description provided for @healthFair.
  ///
  /// In en, this message translates to:
  /// **'Fair'**
  String get healthFair;

  /// No description provided for @healthPoor.
  ///
  /// In en, this message translates to:
  /// **'Poor'**
  String get healthPoor;

  /// No description provided for @sensors.
  ///
  /// In en, this message translates to:
  /// **'What this tracker reports'**
  String get sensors;

  /// No description provided for @live.
  ///
  /// In en, this message translates to:
  /// **'Live'**
  String get live;

  /// No description provided for @journey.
  ///
  /// In en, this message translates to:
  /// **'Journey'**
  String get journey;

  /// No description provided for @control.
  ///
  /// In en, this message translates to:
  /// **'Control'**
  String get control;

  /// No description provided for @alerts.
  ///
  /// In en, this message translates to:
  /// **'Alerts'**
  String get alerts;

  /// No description provided for @zones.
  ///
  /// In en, this message translates to:
  /// **'Zones'**
  String get zones;

  /// No description provided for @today.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get today;

  /// No description provided for @yesterday.
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get yesterday;

  /// No description provided for @pickDate.
  ///
  /// In en, this message translates to:
  /// **'Pick a day'**
  String get pickDate;

  /// No description provided for @distance.
  ///
  /// In en, this message translates to:
  /// **'Distance'**
  String get distance;

  /// No description provided for @drivingTime.
  ///
  /// In en, this message translates to:
  /// **'Driving'**
  String get drivingTime;

  /// No description provided for @parkedTime.
  ///
  /// In en, this message translates to:
  /// **'Parked'**
  String get parkedTime;

  /// No description provided for @maxSpeed.
  ///
  /// In en, this message translates to:
  /// **'Top speed'**
  String get maxSpeed;

  /// No description provided for @avgSpeed.
  ///
  /// In en, this message translates to:
  /// **'Avg speed'**
  String get avgSpeed;

  /// No description provided for @noJourney.
  ///
  /// In en, this message translates to:
  /// **'No movement recorded on this day'**
  String get noJourney;

  /// No description provided for @truncated.
  ///
  /// In en, this message translates to:
  /// **'Too many points; showing the first part of the day'**
  String get truncated;

  /// No description provided for @trip.
  ///
  /// In en, this message translates to:
  /// **'Trip'**
  String get trip;

  /// No description provided for @stop.
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get stop;

  /// No description provided for @replay.
  ///
  /// In en, this message translates to:
  /// **'Replay'**
  String get replay;

  /// No description provided for @backfill.
  ///
  /// In en, this message translates to:
  /// **'Delivered late (no coverage)'**
  String get backfill;

  /// No description provided for @remoteControl.
  ///
  /// In en, this message translates to:
  /// **'Remote control'**
  String get remoteControl;

  /// No description provided for @engineCut.
  ///
  /// In en, this message translates to:
  /// **'Cut engine'**
  String get engineCut;

  /// No description provided for @engineRestore.
  ///
  /// In en, this message translates to:
  /// **'Restore engine'**
  String get engineRestore;

  /// No description provided for @doorLock.
  ///
  /// In en, this message translates to:
  /// **'Lock doors'**
  String get doorLock;

  /// No description provided for @doorUnlock.
  ///
  /// In en, this message translates to:
  /// **'Unlock doors'**
  String get doorUnlock;

  /// No description provided for @locate.
  ///
  /// In en, this message translates to:
  /// **'Locate now'**
  String get locate;

  /// No description provided for @reboot.
  ///
  /// In en, this message translates to:
  /// **'Restart tracker'**
  String get reboot;

  /// No description provided for @slideToConfirm.
  ///
  /// In en, this message translates to:
  /// **'Slide to confirm'**
  String get slideToConfirm;

  /// No description provided for @engineCutWarning.
  ///
  /// In en, this message translates to:
  /// **'The engine will only be cut when the vehicle is below 10 km/h. Use it for a stolen vehicle.'**
  String get engineCutWarning;

  /// No description provided for @commandSent.
  ///
  /// In en, this message translates to:
  /// **'Sent to the vehicle'**
  String get commandSent;

  /// No description provided for @commandQueued.
  ///
  /// In en, this message translates to:
  /// **'Queued: the vehicle is not reachable right now'**
  String get commandQueued;

  /// No description provided for @commandRefusedMoving.
  ///
  /// In en, this message translates to:
  /// **'Refused: the vehicle is moving'**
  String get commandRefusedMoving;

  /// No description provided for @recentCommands.
  ///
  /// In en, this message translates to:
  /// **'Recent commands'**
  String get recentCommands;

  /// No description provided for @statusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get statusPending;

  /// No description provided for @statusSent.
  ///
  /// In en, this message translates to:
  /// **'Sent'**
  String get statusSent;

  /// No description provided for @statusAcked.
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get statusAcked;

  /// No description provided for @statusFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get statusFailed;

  /// No description provided for @statusExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get statusExpired;

  /// No description provided for @guardMode.
  ///
  /// In en, this message translates to:
  /// **'Guard mode'**
  String get guardMode;

  /// No description provided for @guardModeDesc.
  ///
  /// In en, this message translates to:
  /// **'Alert me the moment the vehicle leaves where it is parked now'**
  String get guardModeDesc;

  /// No description provided for @guardArmed.
  ///
  /// In en, this message translates to:
  /// **'Armed — watching a {m} m circle'**
  String guardArmed(String m);

  /// No description provided for @guardNeedsFix.
  ///
  /// In en, this message translates to:
  /// **'Needs a current position'**
  String get guardNeedsFix;

  /// No description provided for @markAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all read'**
  String get markAllRead;

  /// No description provided for @noAlerts.
  ///
  /// In en, this message translates to:
  /// **'All quiet. No alerts.'**
  String get noAlerts;

  /// No description provided for @alertImpact.
  ///
  /// In en, this message translates to:
  /// **'Impact detected'**
  String get alertImpact;

  /// No description provided for @alertSos.
  ///
  /// In en, this message translates to:
  /// **'SOS pressed'**
  String get alertSos;

  /// No description provided for @alertPowerCut.
  ///
  /// In en, this message translates to:
  /// **'Vehicle power cut'**
  String get alertPowerCut;

  /// No description provided for @alertPowerRestored.
  ///
  /// In en, this message translates to:
  /// **'Vehicle power restored'**
  String get alertPowerRestored;

  /// No description provided for @alertTow.
  ///
  /// In en, this message translates to:
  /// **'Possible towing'**
  String get alertTow;

  /// No description provided for @alertJamming.
  ///
  /// In en, this message translates to:
  /// **'Signal jamming'**
  String get alertJamming;

  /// No description provided for @alertOverspeed.
  ///
  /// In en, this message translates to:
  /// **'Speed limit exceeded'**
  String get alertOverspeed;

  /// No description provided for @alertLowBattery.
  ///
  /// In en, this message translates to:
  /// **'Low vehicle battery'**
  String get alertLowBattery;

  /// No description provided for @alertOffline.
  ///
  /// In en, this message translates to:
  /// **'Tracker stopped reporting'**
  String get alertOffline;

  /// No description provided for @alertBackOnline.
  ///
  /// In en, this message translates to:
  /// **'Tracker back online'**
  String get alertBackOnline;

  /// No description provided for @alertGeofenceEnter.
  ///
  /// In en, this message translates to:
  /// **'Entered a zone'**
  String get alertGeofenceEnter;

  /// No description provided for @alertGeofenceExit.
  ///
  /// In en, this message translates to:
  /// **'Left a zone'**
  String get alertGeofenceExit;

  /// No description provided for @alertIgnitionOn.
  ///
  /// In en, this message translates to:
  /// **'Engine started'**
  String get alertIgnitionOn;

  /// No description provided for @alertIgnitionOff.
  ///
  /// In en, this message translates to:
  /// **'Engine stopped'**
  String get alertIgnitionOff;

  /// No description provided for @alertHarshAccel.
  ///
  /// In en, this message translates to:
  /// **'Harsh acceleration'**
  String get alertHarshAccel;

  /// No description provided for @alertHarshBrake.
  ///
  /// In en, this message translates to:
  /// **'Harsh braking'**
  String get alertHarshBrake;

  /// No description provided for @alertHarshCorner.
  ///
  /// In en, this message translates to:
  /// **'Sharp cornering'**
  String get alertHarshCorner;

  /// No description provided for @alertSubExpiring.
  ///
  /// In en, this message translates to:
  /// **'Service plan ending soon'**
  String get alertSubExpiring;

  /// No description provided for @alertSubExpired.
  ///
  /// In en, this message translates to:
  /// **'Service plan expired'**
  String get alertSubExpired;

  /// No description provided for @alertGeneric.
  ///
  /// In en, this message translates to:
  /// **'Vehicle alert'**
  String get alertGeneric;

  /// No description provided for @newZone.
  ///
  /// In en, this message translates to:
  /// **'New zone'**
  String get newZone;

  /// No description provided for @zoneName.
  ///
  /// In en, this message translates to:
  /// **'Zone name'**
  String get zoneName;

  /// No description provided for @radius.
  ///
  /// In en, this message translates to:
  /// **'Radius'**
  String get radius;

  /// No description provided for @meters.
  ///
  /// In en, this message translates to:
  /// **'{m} m'**
  String meters(String m);

  /// No description provided for @triggerOn.
  ///
  /// In en, this message translates to:
  /// **'Alert when'**
  String get triggerOn;

  /// No description provided for @triggerEnter.
  ///
  /// In en, this message translates to:
  /// **'Arrives'**
  String get triggerEnter;

  /// No description provided for @triggerExit.
  ///
  /// In en, this message translates to:
  /// **'Leaves'**
  String get triggerExit;

  /// No description provided for @triggerBoth.
  ///
  /// In en, this message translates to:
  /// **'Both'**
  String get triggerBoth;

  /// No description provided for @zoneHint.
  ///
  /// In en, this message translates to:
  /// **'Long-press the map to place the centre'**
  String get zoneHint;

  /// No description provided for @noZones.
  ///
  /// In en, this message translates to:
  /// **'No zones yet. Add home or work to know when the vehicle arrives or leaves.'**
  String get noZones;

  /// No description provided for @deleteZoneConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete zone \"{name}\"?'**
  String deleteZoneConfirm(String name);

  /// No description provided for @vehicleSettings.
  ///
  /// In en, this message translates to:
  /// **'Vehicle settings'**
  String get vehicleSettings;

  /// No description provided for @rename.
  ///
  /// In en, this message translates to:
  /// **'Rename'**
  String get rename;

  /// No description provided for @vehicleName.
  ///
  /// In en, this message translates to:
  /// **'Vehicle name'**
  String get vehicleName;

  /// No description provided for @speedLimit.
  ///
  /// In en, this message translates to:
  /// **'Speed limit alert'**
  String get speedLimit;

  /// No description provided for @speedLimitOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get speedLimitOff;

  /// No description provided for @reportInterval.
  ///
  /// In en, this message translates to:
  /// **'Reporting interval'**
  String get reportInterval;

  /// No description provided for @seconds.
  ///
  /// In en, this message translates to:
  /// **'{n} s'**
  String seconds(String n);

  /// No description provided for @silentMode.
  ///
  /// In en, this message translates to:
  /// **'Silent mode'**
  String get silentMode;

  /// No description provided for @silentModeDesc.
  ///
  /// In en, this message translates to:
  /// **'Record alerts without notifying'**
  String get silentModeDesc;

  /// No description provided for @alertTypes.
  ///
  /// In en, this message translates to:
  /// **'Alert types'**
  String get alertTypes;

  /// No description provided for @saved.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get saved;

  /// No description provided for @findMyCar.
  ///
  /// In en, this message translates to:
  /// **'Walk to my car'**
  String get findMyCar;

  /// No description provided for @awayFromYou.
  ///
  /// In en, this message translates to:
  /// **'{d} away'**
  String awayFromYou(String d);

  /// No description provided for @locationDenied.
  ///
  /// In en, this message translates to:
  /// **'Allow location access to guide you to the vehicle'**
  String get locationDenied;

  /// No description provided for @exportCsv.
  ///
  /// In en, this message translates to:
  /// **'Export history (CSV)'**
  String get exportCsv;

  /// No description provided for @subscription.
  ///
  /// In en, this message translates to:
  /// **'Service plan'**
  String get subscription;

  /// No description provided for @daysLeft.
  ///
  /// In en, this message translates to:
  /// **'{n} days left'**
  String daysLeft(String n);

  /// No description provided for @expired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get expired;

  /// No description provided for @warranty.
  ///
  /// In en, this message translates to:
  /// **'Warranty'**
  String get warranty;

  /// No description provided for @networkError.
  ///
  /// In en, this message translates to:
  /// **'No connection to the server'**
  String get networkError;

  /// No description provided for @sessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Your session expired. Please sign in again.'**
  String get sessionExpired;

  /// No description provided for @somethingWrong.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get somethingWrong;

  /// No description provided for @showingCached.
  ///
  /// In en, this message translates to:
  /// **'Offline — showing last known data'**
  String get showingCached;

  /// No description provided for @realtimeOn.
  ///
  /// In en, this message translates to:
  /// **'Live'**
  String get realtimeOn;

  /// No description provided for @realtimeOff.
  ///
  /// In en, this message translates to:
  /// **'Reconnecting…'**
  String get realtimeOff;

  /// No description provided for @notReported.
  ///
  /// In en, this message translates to:
  /// **'Not reported'**
  String get notReported;

  /// No description provided for @volts.
  ///
  /// In en, this message translates to:
  /// **'{v} V'**
  String volts(String v);

  /// No description provided for @filterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get filterAll;

  /// No description provided for @filterUnread.
  ///
  /// In en, this message translates to:
  /// **'Unread'**
  String get filterUnread;

  /// No description provided for @severityCritical.
  ///
  /// In en, this message translates to:
  /// **'Critical'**
  String get severityCritical;

  /// No description provided for @severityWarning.
  ///
  /// In en, this message translates to:
  /// **'Warning'**
  String get severityWarning;

  /// No description provided for @severityInfo.
  ///
  /// In en, this message translates to:
  /// **'Info'**
  String get severityInfo;
}

class _LDelegate extends LocalizationsDelegate<L> {
  const _LDelegate();

  @override
  Future<L> load(Locale locale) {
    return SynchronousFuture<L>(lookupL(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'fa', 'it'].contains(locale.languageCode);

  @override
  bool shouldReload(_LDelegate old) => false;
}

L lookupL(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return LEn();
    case 'fa':
      return LFa();
    case 'it':
      return LIt();
  }

  throw FlutterError(
    'L.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
