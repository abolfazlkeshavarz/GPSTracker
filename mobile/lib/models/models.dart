import 'dart:math' as math;

double? _d(dynamic v) => v is num ? v.toDouble() : null;
int? _i(dynamic v) => v is num ? v.toInt() : null;
DateTime? _t(dynamic v) =>
    v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

class User {
  final int id;
  final String phone;
  final String role;
  const User({required this.id, required this.phone, required this.role});

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: _i(j['id']) ?? 0,
        phone: j['phone'] as String? ?? '',
        role: j['role'] as String? ?? 'user',
      );

  Map<String, dynamic> toJson() => {'id': id, 'phone': phone, 'role': role};
}

class Subscription {
  final String plan;
  final DateTime? expiresAt;
  final int daysRemaining;
  final bool isActive;
  final bool isExpiring;
  const Subscription(
      {required this.plan,
      this.expiresAt,
      required this.daysRemaining,
      required this.isActive,
      required this.isExpiring});

  factory Subscription.fromJson(Map<String, dynamic> j) => Subscription(
        plan: j['plan'] as String? ?? '',
        expiresAt: _t(j['expires_at']),
        daysRemaining: _i(j['days_remaining']) ?? 0,
        isActive: j['is_active'] == true,
        isExpiring: j['is_expiring'] == true,
      );
}

class Device {
  final String serial;
  final String name;
  final String model;
  final bool isActive;
  final Subscription? subscription;
  final Map<String, dynamic> raw;

  const Device(
      {required this.serial,
      required this.name,
      required this.model,
      required this.isActive,
      this.subscription,
      this.raw = const {}});

  String get label => name.trim().isEmpty ? serial : name;

  factory Device.fromJson(Map<String, dynamic> j) => Device(
        serial: j['serial'] as String? ?? '',
        name: j['name'] as String? ?? '',
        model: j['model'] as String? ?? '',
        isActive: j['is_active'] == true,
        subscription: j['subscription'] is Map<String, dynamic>
            ? Subscription.fromJson(j['subscription'])
            : null,
        raw: j,
      );

  Device copyWith({String? name}) => Device(
      serial: serial,
      name: name ?? this.name,
      model: model,
      isActive: isActive,
      subscription: subscription,
      raw: {...raw, if (name != null) 'name': name});
}

/// A live position. Every optional field is genuinely optional: trackers in
/// the field run several firmware generations, and the server omits what a
/// unit does not report. Absence means "this hardware cannot tell us", which
/// the UI treats differently from a real zero.
class Position {
  final String device;
  final double lat;
  final double lng;
  final int speed;
  final int satellites;
  final int? csq;
  final double? battery;
  final String? operator;
  final bool? ignition;
  final DateTime? time;
  final double? heading;
  final double? altitude;
  final double? hdop;
  final int? fixAgeMs;
  final bool? extPower;
  final bool? jamming;

  const Position({
    required this.device,
    required this.lat,
    required this.lng,
    required this.speed,
    required this.satellites,
    this.csq,
    this.battery,
    this.operator,
    this.ignition,
    this.time,
    this.heading,
    this.altitude,
    this.hdop,
    this.fixAgeMs,
    this.extPower,
    this.jamming,
  });

  factory Position.fromJson(Map<String, dynamic> j) {
    final ts = _i(j['timestamp']);
    return Position(
      device: j['device'] as String? ?? '',
      lat: _d(j['lat']) ?? 0,
      lng: _d(j['lng']) ?? 0,
      speed: _i(j['speed']) ?? 0,
      satellites: _i(j['sat']) ?? _i(j['satellites']) ?? 0,
      csq: _i(j['csq']),
      battery: _d(j['battery']),
      operator: j['operator'] as String?,
      // The server drops ignition=false as "omitempty", so a present key is
      // on and a missing one is off-or-unknown.
      ignition: j.containsKey('ignition') ? j['ignition'] == true : null,
      time: ts != null && ts > 0
          ? DateTime.fromMillisecondsSinceEpoch(ts * 1000)
          : _t(j['recorded_at']),
      heading: _d(j['heading']),
      altitude: _d(j['altitude']),
      hdop: _d(j['hdop']),
      fixAgeMs: _i(j['fix_age_ms']),
      extPower: j['ext_power'] as bool?,
      jamming: j['jamming'] as bool?,
    );
  }

  bool get hasFix => !(lat == 0 && lng == 0);
}

/// Which sensors a given tracker actually has, learned from what it sends.
/// Lets one app serve a bare GPS+GSM unit and a fully equipped one without
/// showing empty gauges for hardware that is not there.
class Capabilities {
  bool battery = false;
  bool ignition = false;
  bool heading = false;
  bool altitude = false;
  bool hdop = false;
  bool csq = false;
  bool extPower = false;
  bool jamming = false;
  bool operator = false;

  void learn(Position p) {
    battery |= (p.battery ?? 0) > 0;
    ignition |= p.ignition != null;
    heading |= p.heading != null;
    altitude |= p.altitude != null;
    hdop |= (p.hdop ?? 0) > 0;
    csq |= p.csq != null && p.csq! > 0 && p.csq! != 99;
    extPower |= p.extPower != null;
    jamming |= p.jamming != null;
    operator |= (p.operator ?? '').isNotEmpty;
  }

  void learnPoint(TrackPoint p) {
    battery |= p.battery > 0;
    ignition |= p.ignition != null;
    heading |= p.heading != null;
    altitude |= p.altitude != null;
    hdop |= (p.hdop ?? 0) > 0;
    csq |= p.csq > 0 && p.csq != 99;
  }
}

class TrackPoint {
  final double lat;
  final double lng;
  final int speed;
  final int satellites;
  final int csq;
  final double battery;
  final bool? ignition;
  final double? heading;
  final double? altitude;
  final double? hdop;
  final bool isBackfill;
  final DateTime time;

  const TrackPoint({
    required this.lat,
    required this.lng,
    required this.speed,
    required this.satellites,
    required this.csq,
    required this.battery,
    this.ignition,
    this.heading,
    this.altitude,
    this.hdop,
    required this.isBackfill,
    required this.time,
  });

  factory TrackPoint.fromJson(Map<String, dynamic> j) => TrackPoint(
        lat: _d(j['lat']) ?? 0,
        lng: _d(j['lng']) ?? 0,
        speed: _i(j['speed']) ?? 0,
        satellites: _i(j['satellites']) ?? 0,
        csq: _i(j['csq']) ?? 0,
        battery: _d(j['battery']) ?? 0,
        ignition: j['ignition'] as bool?,
        heading: _d(j['heading']),
        altitude: _d(j['altitude']),
        hdop: _d(j['hdop']),
        isBackfill: j['is_backfill'] == true,
        time: _t(j['recorded_at']) ?? DateTime.now(),
      );
}

class TrackStop {
  final double lat;
  final double lng;
  final DateTime arrived;
  final DateTime departed;
  final int seconds;
  const TrackStop(
      {required this.lat,
      required this.lng,
      required this.arrived,
      required this.departed,
      required this.seconds});

  factory TrackStop.fromJson(Map<String, dynamic> j) => TrackStop(
        lat: _d(j['lat']) ?? 0,
        lng: _d(j['lng']) ?? 0,
        arrived: _t(j['arrived_at']) ?? DateTime.now(),
        departed: _t(j['departed_at']) ?? DateTime.now(),
        seconds: _i(j['duration_seconds']) ?? 0,
      );
}

class TrackSummary {
  final double distanceKm;
  final int maxSpeed;
  final int avgMovingSpeed;
  final int movingSeconds;
  final int stoppedSeconds;
  const TrackSummary(
      {this.distanceKm = 0,
      this.maxSpeed = 0,
      this.avgMovingSpeed = 0,
      this.movingSeconds = 0,
      this.stoppedSeconds = 0});

  factory TrackSummary.fromJson(Map<String, dynamic> j) => TrackSummary(
        distanceKm: _d(j['distance_km']) ?? 0,
        maxSpeed: _i(j['max_speed']) ?? 0,
        avgMovingSpeed: _i(j['avg_moving_speed']) ?? 0,
        movingSeconds: _i(j['moving_seconds']) ?? 0,
        stoppedSeconds: _i(j['stopped_seconds']) ?? 0,
      );
}

/// A leg of driving between two stops, derived on the client from the
/// server's points and detected stops.
class TripLeg {
  final List<TrackPoint> points;
  const TripLeg(this.points);

  DateTime get start => points.first.time;
  DateTime get end => points.last.time;
  int get maxSpeed => points.fold(0, (m, p) => math.max(m, p.speed));
  double get distanceKm {
    var d = 0.0;
    for (var i = 1; i < points.length; i++) {
      d += haversineM(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }
    return d / 1000;
  }
}

sealed class JourneyEntry {
  const JourneyEntry();
}

class JourneyTrip extends JourneyEntry {
  final TripLeg leg;
  const JourneyTrip(this.leg);
}

class JourneyStop extends JourneyEntry {
  final TrackStop stop;
  const JourneyStop(this.stop);
}

class Track {
  final List<TrackPoint> points;
  final List<TrackStop> stops;
  final TrackSummary summary;
  final bool truncated;
  const Track(
      {required this.points,
      required this.stops,
      required this.summary,
      required this.truncated});

  factory Track.fromJson(Map<String, dynamic> j) => Track(
        points: [for (final p in (j['points'] as List? ?? [])) TrackPoint.fromJson(p)],
        stops: [for (final s in (j['stops'] as List? ?? [])) TrackStop.fromJson(s)],
        summary: j['summary'] is Map<String, dynamic>
            ? TrackSummary.fromJson(j['summary'])
            : const TrackSummary(),
        truncated: j['truncated'] == true,
      );

  /// Interleaves trips and stops into one chronological story.
  List<JourneyEntry> get story {
    final out = <JourneyEntry>[];
    var cursor = 0;
    for (final s in stops) {
      final leg = <TrackPoint>[];
      while (cursor < points.length && points[cursor].time.isBefore(s.arrived)) {
        leg.add(points[cursor++]);
      }
      if (leg.length >= 2) out.add(JourneyTrip(TripLeg(leg)));
      out.add(JourneyStop(s));
      while (cursor < points.length && !points[cursor].time.isAfter(s.departed)) {
        cursor++;
      }
    }
    final tail = points.sublist(math.min(cursor, points.length));
    if (tail.length >= 2) out.add(JourneyTrip(TripLeg(tail)));
    return out;
  }
}

class DeviceSettings {
  final int speedLimitKmh;
  final int reportIntervalS;
  final Map<String, bool> toggles;
  final bool silentMode;

  static const alertKeys = [
    'alert_overspeed',
    'alert_ignition',
    'alert_tow',
    'alert_impact',
    'alert_harsh_driving',
    'alert_power_cut',
    'alert_jamming',
    'alert_low_battery',
    'alert_geofence',
    'alert_offline',
  ];

  const DeviceSettings(
      {required this.speedLimitKmh,
      required this.reportIntervalS,
      required this.toggles,
      required this.silentMode});

  factory DeviceSettings.fromJson(Map<String, dynamic> j) => DeviceSettings(
        speedLimitKmh: _i(j['speed_limit_kmh']) ?? 0,
        reportIntervalS: _i(j['report_interval_s']) ?? 30,
        toggles: {for (final k in alertKeys) k: j[k] != false},
        silentMode: j['silent_mode'] == true,
      );
}

class Command {
  final int id;
  final String command;
  final String status;
  final DateTime? issuedAt;
  final String result;
  const Command(
      {required this.id,
      required this.command,
      required this.status,
      this.issuedAt,
      this.result = ''});

  factory Command.fromJson(Map<String, dynamic> j) => Command(
        id: _i(j['id']) ?? 0,
        command: j['command'] as String? ?? '',
        status: j['status'] as String? ?? 'pending',
        issuedAt: _t(j['issued_at']),
        result: j['result'] as String? ?? '',
      );
}

class Geofence {
  final int id;
  final String name;
  final double lat;
  final double lng;
  final int radiusM;
  final String triggerOn;
  final bool isActive;
  const Geofence(
      {required this.id,
      required this.name,
      required this.lat,
      required this.lng,
      required this.radiusM,
      required this.triggerOn,
      required this.isActive});

  static const guardName = 'Guard mode';
  bool get isGuard => name == guardName;

  factory Geofence.fromJson(Map<String, dynamic> j) => Geofence(
        id: _i(j['id']) ?? 0,
        name: j['name'] as String? ?? '',
        lat: _d(j['lat']) ?? 0,
        lng: _d(j['lng']) ?? 0,
        radiusM: _i(j['radius_m']) ?? 100,
        triggerOn: j['trigger_on'] as String? ?? 'both',
        isActive: j['is_active'] != false,
      );
}

class Alert {
  final int id;
  final String device;
  final String kind;
  final String severity;
  final String title;
  final String detail;
  final double? lat;
  final double? lng;
  final bool isRead;
  final DateTime createdAt;
  const Alert(
      {required this.id,
      required this.device,
      required this.kind,
      required this.severity,
      required this.title,
      required this.detail,
      this.lat,
      this.lng,
      required this.isRead,
      required this.createdAt});

  factory Alert.fromJson(Map<String, dynamic> j) => Alert(
        id: _i(j['id']) ?? 0,
        device: j['device_serial'] as String? ?? '',
        kind: j['kind'] as String? ?? '',
        severity: j['severity'] as String? ?? 'info',
        title: j['title'] as String? ?? '',
        detail: j['detail'] as String? ?? '',
        lat: _d(j['lat']),
        lng: _d(j['lng']),
        isRead: j['is_read'] == true,
        createdAt: _t(j['created_at']) ?? DateTime.now(),
      );

  Alert read() => Alert(
      id: id,
      device: device,
      kind: kind,
      severity: severity,
      title: title,
      detail: detail,
      lat: lat,
      lng: lng,
      isRead: true,
      createdAt: createdAt);
}

class PlanInfo {
  final Subscription? subscription;
  final DateTime? warrantyExpires;
  final bool warrantyActive;
  const PlanInfo({this.subscription, this.warrantyExpires, this.warrantyActive = false});

  factory PlanInfo.fromJson(Map<String, dynamic> j) {
    final w = j['warranty'];
    return PlanInfo(
      subscription: j['subscription'] is Map<String, dynamic>
          ? Subscription.fromJson(j['subscription'])
          : null,
      warrantyExpires: w is Map ? _t(w['expires_at']) : null,
      warrantyActive: w is Map && w['is_active'] == true,
    );
  }
}

double haversineM(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0;
  final dLat = (lat2 - lat1) * math.pi / 180;
  final dLng = (lng2 - lng1) * math.pi / 180;
  final a = math.pow(math.sin(dLat / 2), 2) +
      math.cos(lat1 * math.pi / 180) *
          math.cos(lat2 * math.pi / 180) *
          math.pow(math.sin(dLng / 2), 2);
  return 2 * r * math.asin(math.sqrt(a));
}

double bearingDeg(double lat1, double lng1, double lat2, double lng2) {
  final p1 = lat1 * math.pi / 180, p2 = lat2 * math.pi / 180;
  final dl = (lng2 - lng1) * math.pi / 180;
  final y = math.sin(dl) * math.cos(p2);
  final x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

enum Health { excellent, good, fair, poor }

/// One glanceable score from freshness, GPS quality and cell signal.
Health healthOf(Position? p, {required bool online, int intervalS = 30}) {
  if (p == null || !online) return Health.poor;
  var score = 0;
  final age = p.time == null ? 1 << 30 : DateTime.now().difference(p.time!).inSeconds;
  if (age < intervalS * 3) {
    score += 2;
  } else if (age < 900) {
    score += 1;
  }
  if (p.hdop != null && p.hdop! > 0) {
    score += p.hdop! <= 1.5 ? 2 : (p.hdop! <= 3 ? 1 : 0);
  } else {
    score += p.satellites >= 7 ? 2 : (p.satellites >= 4 ? 1 : 0);
  }
  final csq = p.csq;
  if (csq == null || csq == 0 || csq == 99) {
    score += 1;
  } else {
    score += csq >= 15 ? 2 : (csq >= 9 ? 1 : 0);
  }
  if (p.jamming == true || p.extPower == false) score -= 2;
  if (score >= 6) return Health.excellent;
  if (score >= 4) return Health.good;
  if (score >= 2) return Health.fair;
  return Health.poor;
}
