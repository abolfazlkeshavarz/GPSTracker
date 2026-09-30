import 'package:flutter_test/flutter_test.dart';
import 'package:gpstracker_mobile/core/config.dart';
import 'package:gpstracker_mobile/models/models.dart';

TrackPoint pt(double lat, double lng, DateTime t, {int speed = 40}) => TrackPoint(
    lat: lat, lng: lng, speed: speed, satellites: 8, csq: 20, battery: 0, isBackfill: false, time: t);

void main() {
  group('Position', () {
    test('keeps unreported fields null so old firmware is not shown as zero', () {
      final p = Position.fromJson({'device': 'A', 'lat': 35.7, 'lng': 51.4, 'speed': 12, 'sat': 7});
      expect(p.heading, isNull);
      expect(p.battery, isNull);
      expect(p.ignition, isNull);
      expect(p.hasFix, isTrue);
    });

    test('reads unix timestamp', () {
      final p = Position.fromJson({'device': 'A', 'lat': 1, 'lng': 1, 'timestamp': 1700000000});
      expect(p.time!.toUtc(), DateTime.utc(2023, 11, 14, 22, 13, 20));
    });
  });

  test('capabilities are learned from what the hardware sends', () {
    final c = Capabilities()
      ..learn(Position.fromJson({'device': 'A', 'lat': 1, 'lng': 1, 'battery': 12.6, 'heading': 90}));
    expect(c.battery, isTrue);
    expect(c.heading, isTrue);
    expect(c.jamming, isFalse);
    expect(c.hdop, isFalse);
  });

  test('journey story interleaves trips and stops', () {
    final t0 = DateTime(2026, 1, 1, 8);
    final track = Track(
      points: [
        pt(35.70, 51.40, t0),
        pt(35.71, 51.41, t0.add(const Duration(minutes: 5))),
        pt(35.72, 51.42, t0.add(const Duration(minutes: 10)), speed: 0),
        pt(35.72, 51.42, t0.add(const Duration(minutes: 40)), speed: 0),
        pt(35.73, 51.43, t0.add(const Duration(minutes: 45))),
        pt(35.74, 51.44, t0.add(const Duration(minutes: 50))),
      ],
      stops: [
        TrackStop(
            lat: 35.72,
            lng: 51.42,
            arrived: t0.add(const Duration(minutes: 10)),
            departed: t0.add(const Duration(minutes: 40)),
            seconds: 1800),
      ],
      summary: const TrackSummary(),
      truncated: false,
    );
    final story = track.story;
    expect(story.length, 3);
    expect(story[0], isA<JourneyTrip>());
    expect(story[1], isA<JourneyStop>());
    expect(story[2], isA<JourneyTrip>());
    expect((story[0] as JourneyTrip).leg.distanceKm, greaterThan(1));
  });

  test('health degrades with a stale fix', () {
    final fresh = Position(device: 'A', lat: 1, lng: 1, speed: 0, satellites: 9, csq: 20, time: DateTime.now());
    final stale = Position(
        device: 'A',
        lat: 1,
        lng: 1,
        speed: 0,
        satellites: 2,
        csq: 5,
        time: DateTime.now().subtract(const Duration(hours: 2)));
    expect(healthOf(fresh, online: true), Health.excellent);
    expect(healthOf(stale, online: true), Health.poor);
    expect(healthOf(fresh, online: false), Health.poor);
  });

  group('server address', () {
    test('adds https and trims slashes', () {
      expect(ServerConfig.normaliseServer(' example.com/ '), 'https://example.com');
    });
    test('rejects junk and credentials in the URL', () {
      expect(ServerConfig.normaliseServer(''), isNull);
      expect(ServerConfig.normaliseServer('https://user:pw@example.com'), isNull);
      expect(ServerConfig.normaliseServer('ftp://example.com'), isNull);
    });
    test('builds API and websocket URIs', () {
      const c = ServerConfig(serverUrl: 'https://example.com/tracker', tileUrl: '');
      expect(c.api('/devices').toString(), 'https://example.com/tracker/api/devices');
      expect(c.websocket.toString(), 'wss://example.com/tracker/api/ws');
    });
    test('platform tile path resolves against the connected server', () {
      const c = ServerConfig(serverUrl: 'https://tracker.example.com/', tileUrl: '');
      expect(c.resolveTiles(ServerConfig.platformTiles),
          'https://tracker.example.com/tiles/styles/osm-bright/{z}/{x}/{y}.png');
      expect(c.resolveTiles('https://other.example.com/{z}/{x}/{y}.png'),
          'https://other.example.com/{z}/{x}/{y}.png');
    });
    test('tile template must contain placeholders', () {
      expect(ServerConfig.isValidTileTemplate(ServerConfig.fallbackTiles), isTrue);
      expect(ServerConfig.isValidTileTemplate(''), isTrue); // follow the server
      expect(ServerConfig.isValidTileTemplate(
          'https://maps.example.com/styles/osm-bright/{z}/{x}/{y}.png'), isTrue);
      expect(ServerConfig.isValidTileTemplate('https://tiles.example.com/a.png'), isFalse);
    });
  });
}
