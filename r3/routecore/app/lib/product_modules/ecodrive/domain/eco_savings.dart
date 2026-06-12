import 'eco_coach.dart';

/// Agrégation pure des économies d'écoconduite par période (mois, année).
/// Aucune IO : la persistance vit dans data/eco_stats_store.dart.

/// Cumuls d'une période. [avgScore] est dérivé de [scoreSum] pour rester
/// exact au fil des ajouts (pas de dérive d'arrondi).
class EcoPeriodStats {
  const EcoPeriodStats({
    this.trips = 0,
    this.km = 0,
    this.fuelSavedL = 0,
    this.moneySavedEur = 0,
    this.co2SavedKg = 0,
    this.scoreSum = 0,
  });

  final int trips;
  final double km;
  final double fuelSavedL;
  final double moneySavedEur;
  final double co2SavedKg;
  final int scoreSum;

  int get avgScore => trips == 0 ? 0 : (scoreSum / trips).round();

  EcoPeriodStats addTrip(EcoTripScore score, double distanceKm) =>
      EcoPeriodStats(
        trips: trips + 1,
        km: km + distanceKm,
        fuelSavedL: fuelSavedL + score.fuelSavedL,
        moneySavedEur: moneySavedEur + score.moneySavedEur,
        co2SavedKg: co2SavedKg + score.co2SavedKg,
        scoreSum: scoreSum + score.score,
      );

  EcoPeriodStats merge(EcoPeriodStats other) => EcoPeriodStats(
        trips: trips + other.trips,
        km: km + other.km,
        fuelSavedL: fuelSavedL + other.fuelSavedL,
        moneySavedEur: moneySavedEur + other.moneySavedEur,
        co2SavedKg: co2SavedKg + other.co2SavedKg,
        scoreSum: scoreSum + other.scoreSum,
      );

  factory EcoPeriodStats.fromJson(Map<String, dynamic> json) => EcoPeriodStats(
        trips: (json['trips'] as num?)?.toInt() ?? 0,
        km: (json['km'] as num?)?.toDouble() ?? 0,
        fuelSavedL: (json['fuelSavedL'] as num?)?.toDouble() ?? 0,
        moneySavedEur: (json['moneySavedEur'] as num?)?.toDouble() ?? 0,
        co2SavedKg: (json['co2SavedKg'] as num?)?.toDouble() ?? 0,
        scoreSum: (json['scoreSum'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'trips': trips,
        'km': km,
        'fuelSavedL': fuelSavedL,
        'moneySavedEur': moneySavedEur,
        'co2SavedKg': co2SavedKg,
        'scoreSum': scoreSum,
      };
}

/// Registre immuable des économies : [addTrip] retourne un nouveau registre
/// (pratique pour un state Riverpod). Clés : mois 'yyyy-MM', année 'yyyy'.
class EcoSavingsLedger {
  const EcoSavingsLedger({this.monthly = const {}, this.yearly = const {}});

  final Map<String, EcoPeriodStats> monthly;
  final Map<String, EcoPeriodStats> yearly;

  static String monthKey(DateTime when) =>
      '${when.year.toString().padLeft(4, '0')}-'
      '${when.month.toString().padLeft(2, '0')}';

  static String yearKey(int year) => year.toString().padLeft(4, '0');

  EcoSavingsLedger addTrip(
      EcoTripScore score, double distanceKm, DateTime when) {
    final mk = monthKey(when);
    final yk = yearKey(when.year);
    final m = Map<String, EcoPeriodStats>.of(monthly);
    final y = Map<String, EcoPeriodStats>.of(yearly);
    m[mk] = (m[mk] ?? const EcoPeriodStats()).addTrip(score, distanceKm);
    y[yk] = (y[yk] ?? const EcoPeriodStats()).addTrip(score, distanceKm);
    return EcoSavingsLedger(monthly: m, yearly: y);
  }

  EcoPeriodStats monthStats(DateTime when) =>
      monthly[monthKey(when)] ?? const EcoPeriodStats();

  EcoPeriodStats yearStats(int year) =>
      yearly[yearKey(year)] ?? const EcoPeriodStats();

  EcoPeriodStats get allTime => yearly.values
      .fold(const EcoPeriodStats(), (acc, stats) => acc.merge(stats));

  factory EcoSavingsLedger.fromJson(Map<String, dynamic> json) =>
      EcoSavingsLedger(
        monthly: _statsMap(json['monthly']),
        yearly: _statsMap(json['yearly']),
      );

  Map<String, dynamic> toJson() => {
        'monthly': {
          for (final e in monthly.entries) e.key: e.value.toJson(),
        },
        'yearly': {
          for (final e in yearly.entries) e.key: e.value.toJson(),
        },
      };

  static Map<String, EcoPeriodStats> _statsMap(dynamic raw) {
    if (raw is! Map<String, dynamic>) return const {};
    return {
      for (final e in raw.entries)
        e.key: EcoPeriodStats.fromJson(e.value as Map<String, dynamic>),
    };
  }
}
