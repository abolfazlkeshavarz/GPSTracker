// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Italian (`it`).
class LIt extends L {
  LIt([String locale = 'it']) : super(locale);

  @override
  String get appName => 'GPSTracker';

  @override
  String get tagline => 'Il tuo veicolo, sempre a portata di mano.';

  @override
  String get phone => 'Numero di telefono';

  @override
  String get password => 'Password';

  @override
  String get confirmPassword => 'Conferma password';

  @override
  String get signIn => 'Accedi';

  @override
  String get createAccount => 'Crea account';

  @override
  String get noAccount => 'Nuovo? Crea un account';

  @override
  String get haveAccount => 'Hai già un account? Accedi';

  @override
  String get passwordTooShort => 'La password deve avere almeno 8 caratteri';

  @override
  String get passwordsDontMatch => 'Le password non coincidono';

  @override
  String get invalidPhone => 'Inserisci un numero di telefono valido';

  @override
  String get invalidCredentials => 'Numero o password errati';

  @override
  String get accountExists => 'Esiste già un account con questo numero';

  @override
  String get accountCreated => 'Account creato. Accedi per continuare.';

  @override
  String get server => 'Server';

  @override
  String get serverSettings => 'Connessione al server';

  @override
  String get serverUrl => 'Indirizzo del server';

  @override
  String get serverUrlHelp =>
      'L\'indirizzo della piattaforma, es. https://example.com';

  @override
  String get mapTiles => 'Sorgente mappa';

  @override
  String get mapTilesHelp => 'Modello URL con i segnaposto z, x e y';

  @override
  String get testConnection => 'Prova connessione';

  @override
  String get connectionOk => 'Server raggiungibile';

  @override
  String get connectionFailed => 'Impossibile raggiungere il server';

  @override
  String get invalidUrl => 'Inserisci un indirizzo https:// valido';

  @override
  String get insecureUrl =>
      'Nelle build di rilascio sono ammessi solo server https://';

  @override
  String get serverChangedRelogin => 'Server cambiato. Accedi di nuovo.';

  @override
  String get restoreDefaults => 'Ripristina predefiniti';

  @override
  String get save => 'Salva';

  @override
  String get cancel => 'Annulla';

  @override
  String get delete => 'Elimina';

  @override
  String get retry => 'Riprova';

  @override
  String get close => 'Chiudi';

  @override
  String get settings => 'Impostazioni';

  @override
  String get language => 'Lingua';

  @override
  String get appearance => 'Aspetto';

  @override
  String get themeSystem => 'Sistema';

  @override
  String get themeLight => 'Chiaro';

  @override
  String get themeDark => 'Scuro';

  @override
  String get security => 'Sicurezza';

  @override
  String get appLock => 'Blocco biometrico';

  @override
  String get appLockDesc => 'Richiedi impronta, volto o PIN per aprire l\'app';

  @override
  String get appLockUnavailable => 'Nessun blocco biometrico o PIN configurato';

  @override
  String get unlockReason => 'Sblocca per vedere i tuoi veicoli';

  @override
  String get unlock => 'Sblocca';

  @override
  String get locked => 'Bloccato';

  @override
  String get account => 'Account';

  @override
  String get changePassword => 'Cambia password';

  @override
  String get currentPassword => 'Password attuale';

  @override
  String get newPassword => 'Nuova password';

  @override
  String get passwordChanged => 'Password aggiornata';

  @override
  String get wrongCurrentPassword => 'La password attuale non è corretta';

  @override
  String get logout => 'Esci';

  @override
  String get logoutConfirm => 'Uscire da questo telefono?';

  @override
  String get about => 'Informazioni';

  @override
  String version(String v) {
    return 'Versione $v';
  }

  @override
  String get notifications => 'Notifiche';

  @override
  String get notificationsDesc =>
      'Mostra gli avvisi dei veicoli come notifiche';

  @override
  String get garage => 'Garage';

  @override
  String get noDevices => 'Nessun tracker';

  @override
  String get noDevicesHint =>
      'Aggiungi il tracker installato usando seriale e codice sull\'etichetta.';

  @override
  String get addDevice => 'Aggiungi tracker';

  @override
  String get serial => 'Numero di serie';

  @override
  String get deviceSecret => 'Codice dispositivo';

  @override
  String get activate => 'Attiva';

  @override
  String activated(String days) {
    return 'Tracker aggiunto. $days giorni di servizio inclusi.';
  }

  @override
  String get deviceNotFound => 'Nessun tracker con questo seriale';

  @override
  String get wrongSecret => 'Codice dispositivo errato';

  @override
  String get alreadyActivated => 'Questo tracker è già registrato';

  @override
  String get online => 'Online';

  @override
  String get offline => 'Offline';

  @override
  String get moving => 'In movimento';

  @override
  String get parked => 'Parcheggiato';

  @override
  String get idling => 'Motore acceso';

  @override
  String get noSignalYet => 'In attesa della prima posizione';

  @override
  String get justNow => 'adesso';

  @override
  String minutesAgo(String n) {
    return '$n min fa';
  }

  @override
  String hoursAgo(String n) {
    return '$n h fa';
  }

  @override
  String daysAgo(String n) {
    return '$n g fa';
  }

  @override
  String get speed => 'Velocità';

  @override
  String get kmh => 'km/h';

  @override
  String get km => 'km';

  @override
  String get satellites => 'Satelliti';

  @override
  String get cellSignal => 'Segnale cellulare';

  @override
  String get battery => 'Batteria veicolo';

  @override
  String get ignition => 'Accensione';

  @override
  String get on => 'Acceso';

  @override
  String get off => 'Spento';

  @override
  String get heading => 'Direzione';

  @override
  String get altitude => 'Altitudine';

  @override
  String get gpsAccuracy => 'Precisione GPS';

  @override
  String get extPower => 'Alimentazione esterna';

  @override
  String get connected => 'Collegata';

  @override
  String get disconnected => 'Interrotta';

  @override
  String get jamming => 'Disturbo segnale';

  @override
  String get detected => 'Rilevato';

  @override
  String get clear => 'Assente';

  @override
  String get operator => 'Operatore';

  @override
  String get odometer => 'Contachilometri';

  @override
  String get setOdometer => 'Imposta contachilometri';

  @override
  String get odometerHint => 'Allinea al valore sul cruscotto';

  @override
  String get health => 'Stato del tracker';

  @override
  String get healthExcellent => 'Ottimo';

  @override
  String get healthGood => 'Buono';

  @override
  String get healthFair => 'Discreto';

  @override
  String get healthPoor => 'Scarso';

  @override
  String get sensors => 'Cosa rileva questo tracker';

  @override
  String get live => 'Live';

  @override
  String get journey => 'Viaggi';

  @override
  String get control => 'Controllo';

  @override
  String get alerts => 'Avvisi';

  @override
  String get zones => 'Zone';

  @override
  String get today => 'Oggi';

  @override
  String get yesterday => 'Ieri';

  @override
  String get pickDate => 'Scegli un giorno';

  @override
  String get distance => 'Distanza';

  @override
  String get drivingTime => 'Guida';

  @override
  String get parkedTime => 'Sosta';

  @override
  String get maxSpeed => 'Velocità max';

  @override
  String get avgSpeed => 'Velocità media';

  @override
  String get noJourney => 'Nessun movimento registrato in questo giorno';

  @override
  String get truncated => 'Troppi punti: mostrata la prima parte del giorno';

  @override
  String get trip => 'Viaggio';

  @override
  String get stop => 'Sosta';

  @override
  String get replay => 'Riproduci';

  @override
  String get backfill => 'Arrivato in ritardo (senza copertura)';

  @override
  String get remoteControl => 'Controllo remoto';

  @override
  String get engineCut => 'Blocca motore';

  @override
  String get engineRestore => 'Sblocca motore';

  @override
  String get doorLock => 'Chiudi porte';

  @override
  String get doorUnlock => 'Apri porte';

  @override
  String get locate => 'Localizza ora';

  @override
  String get reboot => 'Riavvia tracker';

  @override
  String get slideToConfirm => 'Scorri per confermare';

  @override
  String get engineCutWarning =>
      'Il motore viene bloccato solo sotto i 10 km/h. Da usare per un veicolo rubato.';

  @override
  String get commandSent => 'Inviato al veicolo';

  @override
  String get commandQueued => 'In coda: veicolo non raggiungibile';

  @override
  String get commandRefusedMoving => 'Rifiutato: il veicolo è in movimento';

  @override
  String get recentCommands => 'Comandi recenti';

  @override
  String get statusPending => 'In attesa';

  @override
  String get statusSent => 'Inviato';

  @override
  String get statusAcked => 'Confermato';

  @override
  String get statusFailed => 'Fallito';

  @override
  String get statusExpired => 'Scaduto';

  @override
  String get guardMode => 'Modalità guardia';

  @override
  String get guardModeDesc =>
      'Avvisami appena il veicolo lascia il punto in cui è parcheggiato';

  @override
  String guardArmed(String m) {
    return 'Attiva — sorveglia un cerchio di $m m';
  }

  @override
  String get guardNeedsFix => 'Serve una posizione attuale';

  @override
  String get markAllRead => 'Segna tutti come letti';

  @override
  String get noAlerts => 'Tutto tranquillo. Nessun avviso.';

  @override
  String get alertImpact => 'Urto rilevato';

  @override
  String get alertSos => 'SOS premuto';

  @override
  String get alertPowerCut => 'Alimentazione interrotta';

  @override
  String get alertPowerRestored => 'Alimentazione ripristinata';

  @override
  String get alertTow => 'Possibile traino';

  @override
  String get alertJamming => 'Disturbo del segnale';

  @override
  String get alertOverspeed => 'Limite di velocità superato';

  @override
  String get alertLowBattery => 'Batteria del veicolo scarica';

  @override
  String get alertOffline => 'Il tracker non trasmette';

  @override
  String get alertBackOnline => 'Tracker di nuovo online';

  @override
  String get alertGeofenceEnter => 'Ingresso in una zona';

  @override
  String get alertGeofenceExit => 'Uscita da una zona';

  @override
  String get alertIgnitionOn => 'Motore acceso';

  @override
  String get alertIgnitionOff => 'Motore spento';

  @override
  String get alertHarshAccel => 'Accelerazione brusca';

  @override
  String get alertHarshBrake => 'Frenata brusca';

  @override
  String get alertHarshCorner => 'Curva brusca';

  @override
  String get alertSubExpiring => 'Piano in scadenza';

  @override
  String get alertSubExpired => 'Piano scaduto';

  @override
  String get alertGeneric => 'Avviso veicolo';

  @override
  String get newZone => 'Nuova zona';

  @override
  String get zoneName => 'Nome zona';

  @override
  String get radius => 'Raggio';

  @override
  String meters(String m) {
    return '$m m';
  }

  @override
  String get triggerOn => 'Avvisa quando';

  @override
  String get triggerEnter => 'Entra';

  @override
  String get triggerExit => 'Esce';

  @override
  String get triggerBoth => 'Entrambi';

  @override
  String get zoneHint => 'Tieni premuto sulla mappa per il centro';

  @override
  String get noZones =>
      'Nessuna zona. Aggiungi casa o lavoro per sapere quando il veicolo arriva o parte.';

  @override
  String deleteZoneConfirm(String name) {
    return 'Eliminare la zona \"$name\"?';
  }

  @override
  String get vehicleSettings => 'Impostazioni veicolo';

  @override
  String get rename => 'Rinomina';

  @override
  String get vehicleName => 'Nome veicolo';

  @override
  String get speedLimit => 'Avviso limite velocità';

  @override
  String get speedLimitOff => 'Disattivato';

  @override
  String get reportInterval => 'Intervallo di invio';

  @override
  String seconds(String n) {
    return '$n s';
  }

  @override
  String get silentMode => 'Modalità silenziosa';

  @override
  String get silentModeDesc => 'Registra gli avvisi senza notificare';

  @override
  String get alertTypes => 'Tipi di avviso';

  @override
  String get saved => 'Salvato';

  @override
  String get findMyCar => 'Raggiungi l\'auto';

  @override
  String awayFromYou(String d) {
    return 'a $d';
  }

  @override
  String get locationDenied =>
      'Consenti l\'accesso alla posizione per guidarti al veicolo';

  @override
  String get exportCsv => 'Esporta cronologia (CSV)';

  @override
  String get subscription => 'Piano di servizio';

  @override
  String daysLeft(String n) {
    return '$n giorni rimasti';
  }

  @override
  String get expired => 'Scaduto';

  @override
  String get warranty => 'Garanzia';

  @override
  String get networkError => 'Nessuna connessione al server';

  @override
  String get sessionExpired => 'Sessione scaduta. Accedi di nuovo.';

  @override
  String get somethingWrong => 'Qualcosa è andato storto';

  @override
  String get showingCached => 'Offline — dati più recenti salvati';

  @override
  String get realtimeOn => 'Live';

  @override
  String get realtimeOff => 'Riconnessione…';

  @override
  String get notReported => 'Non rilevato';

  @override
  String volts(String v) {
    return '$v V';
  }

  @override
  String get filterAll => 'Tutti';

  @override
  String get filterUnread => 'Non letti';

  @override
  String get severityCritical => 'Critici';

  @override
  String get severityWarning => 'Attenzione';

  @override
  String get severityInfo => 'Info';
}
