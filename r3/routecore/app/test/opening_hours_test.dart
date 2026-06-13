import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/poi/domain/opening_hours.dart';
import 'package:routecore/product_modules/terroir/domain/terroir_relevance_scorer.dart';
import 'package:routecore/shared/models/models.dart';

// June 2026: the 1st is a Monday — days below are picked from that week.
DateTime at(int day, int hour, [int minute = 0]) =>
    DateTime(2026, 6, day, hour, minute);

void main() {
  test('week of 2026-06-01 anchors on a Monday', () {
    expect(DateTime(2026, 6, 1).weekday, DateTime.monday);
    expect(DateTime(2026, 6, 7).weekday, DateTime.sunday);
  });

  group('OpeningHours.tryParse', () {
    test('24/7 is always open', () {
      final oh = OpeningHours.tryParse('24/7');
      expect(oh, isNotNull);
      expect(oh!.always, isTrue);
      expect(oh.isOpenAt(at(7, 3, 30)), isTrue); // Sunday, 03:30
    });

    test('day range with a single time range', () {
      final oh = OpeningHours.tryParse('Mo-Fr 08:00-19:00')!;
      expect(oh.always, isFalse);
      expect(oh.isOpenAt(at(3, 10)), isTrue); // Wednesday 10:00
      expect(oh.isOpenAt(at(3, 19)), isFalse); // Wednesday 19:00 (end excl.)
      expect(oh.isOpenAt(at(3, 7, 59)), isFalse); // Wednesday before opening
      expect(oh.isOpenAt(at(6, 10)), isFalse); // Saturday: day not mentioned
    });

    test('lunch split (two time ranges)', () {
      final oh = OpeningHours.tryParse('Tu-Sa 08:30-12:30,15:00-19:00')!;
      expect(oh.isOpenAt(at(2, 9)), isTrue); // Tuesday morning
      expect(oh.isOpenAt(at(2, 13)), isFalse); // Tuesday lunch break
      expect(oh.isOpenAt(at(2, 16)), isTrue); // Tuesday afternoon
      expect(oh.isOpenAt(at(1, 9)), isFalse); // Monday closed
    });

    test('day list', () {
      final oh = OpeningHours.tryParse('Mo,We,Fr 09:00-18:00')!;
      expect(oh.isOpenAt(at(3, 10)), isTrue); // Wednesday
      expect(oh.isOpenAt(at(2, 10)), isFalse); // Tuesday
      expect(oh.isOpenAt(at(5, 17, 59)), isTrue); // Friday
    });

    test('off rule overrides earlier rule for its days', () {
      final oh = OpeningHours.tryParse('Mo-Su 08:00-20:00; Su off')!;
      expect(oh.isOpenAt(at(1, 10)), isTrue); // Monday
      expect(oh.isOpenAt(at(7, 10)), isFalse); // Sunday: off
    });

    test('closed keyword works like off', () {
      final oh = OpeningHours.tryParse('Mo-Sa 08:00-19:00; We closed')!;
      expect(oh.isOpenAt(at(3, 10)), isFalse); // Wednesday closed
      expect(oh.isOpenAt(at(4, 10)), isTrue); // Thursday open
    });

    test('PH off rules are ignored, rest still parses', () {
      final oh = OpeningHours.tryParse('Mo-Fr 08:00-18:00; PH off');
      expect(oh, isNotNull);
      expect(oh!.isOpenAt(at(1, 9)), isTrue);
    });

    test('weekend range Sa-Su', () {
      final oh = OpeningHours.tryParse('Sa-Su 10:00-18:00')!;
      expect(oh.isOpenAt(at(6, 11)), isTrue); // Saturday
      expect(oh.isOpenAt(at(7, 11)), isTrue); // Sunday
      expect(oh.isOpenAt(at(1, 11)), isFalse); // Monday
    });

    test('day range wrapping the week (Fr-Mo)', () {
      final oh = OpeningHours.tryParse('Fr-Mo 09:00-17:00')!;
      expect(oh.isOpenAt(at(5, 10)), isTrue); // Friday
      expect(oh.isOpenAt(at(7, 10)), isTrue); // Sunday
      expect(oh.isOpenAt(at(1, 10)), isTrue); // Monday
      expect(oh.isOpenAt(at(2, 10)), isFalse); // Tuesday
    });

    test('time-only rule applies to every day', () {
      final oh = OpeningHours.tryParse('08:00-12:00')!;
      expect(oh.isOpenAt(at(7, 9)), isTrue); // Sunday morning
      expect(oh.isOpenAt(at(7, 13)), isFalse);
    });

    test('garbage and unsupported syntax return null', () {
      expect(OpeningHours.tryParse(''), isNull);
      expect(OpeningHours.tryParse('sunrise-sunset'), isNull);
      expect(OpeningHours.tryParse('Mo-Fr 08:00-19:00 "sur rendez-vous"'),
          isNull);
      expect(OpeningHours.tryParse('Jul-Aug 10:00-19:00'), isNull);
      expect(OpeningHours.tryParse('Sa'), isNull); // days without times
      expect(OpeningHours.tryParse('Mo-Fr 8h-19h'), isNull);
    });
  });

  group('TerroirRelevanceScorer openNowAt', () {
    const scorer = TerroirRelevanceScorer();

    PoiAlongRoute item({Map<String, dynamic>? openingHours}) => PoiAlongRoute(
          poi: Poi(
            id: 'x1',
            name: 'Halte test',
            categoryId: 'c1',
            categorySlug: 'producer',
            latitude: 45.0,
            longitude: 4.8,
            openingHours: openingHours,
          ),
          distanceFromRouteMeters: 200,
          detourMinutesEstimate: 5,
          relevanceScore: 0,
        );

    test('closed place is demoted (x0.45), not excluded', () {
      final poi = item(openingHours: {'raw': 'Mo-Fr 08:00-18:00'});
      final base = scorer.score(poi, maxDetourMinutes: 30);
      final closed = scorer.score(
        poi,
        maxDetourMinutes: 30,
        openNowAt: at(6, 10), // Saturday: closed
      );
      expect(closed.openingNow, isFalse);
      expect(closed.poiRelevanceScore,
          closeTo(base.poiRelevanceScore * 0.45, 1e-9));
      expect(closed.poiRelevanceScore, greaterThan(0));
    });

    test('open place gets a small boost', () {
      final poi = item(openingHours: {'raw': 'Mo-Fr 08:00-18:00'});
      final base = scorer.score(poi, maxDetourMinutes: 30);
      final open = scorer.score(
        poi,
        maxDetourMinutes: 30,
        openNowAt: at(1, 10), // Monday 10:00: open
      );
      expect(open.openingNow, isTrue);
      expect(
          open.poiRelevanceScore,
          closeTo(
              (base.poiRelevanceScore + 0.08).clamp(0.0, 1.0), 1e-9));
    });

    test('unknown hours leave the score unchanged', () {
      final noHours = item();
      final unparseable = item(openingHours: {'raw': 'sunrise-sunset'});
      for (final poi in [noHours, unparseable]) {
        final base = scorer.score(poi, maxDetourMinutes: 30);
        final withNow =
            scorer.score(poi, maxDetourMinutes: 30, openNowAt: at(6, 10));
        expect(withNow.openingNow, isNull);
        expect(withNow.poiRelevanceScore, base.poiRelevanceScore);
      }
    });

    test('rank demotes closed places below open ones', () {
      final closedPoi = item(openingHours: {'raw': 'Mo-Fr 08:00-18:00'});
      const openPoi = PoiAlongRoute(
        poi: Poi(
          id: 'x2',
          name: 'Halte ouverte',
          categoryId: 'c1',
          categorySlug: 'producer',
          latitude: 45.0,
          longitude: 4.8,
          openingHours: {'raw': '24/7'},
        ),
        distanceFromRouteMeters: 400,
        detourMinutesEstimate: 10, // farther: worse base score
        relevanceScore: 0,
      );
      final ranked = scorer.rank(
        [closedPoi, openPoi],
        maxDetourMinutes: 30,
        openNowAt: at(6, 10), // Saturday
      );
      expect(ranked.length, 2); // demoted, not excluded
      expect(ranked.first.poi.id, 'x2');
    });
  });
}
