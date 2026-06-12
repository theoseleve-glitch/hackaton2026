/// Véhicule embarqué (base ADEME Car Labelling) et sélection utilisateur —
/// sert aux calculs carburant / CO₂ / éco-conduite.
library;

/// Une entrée de la base véhicules (assets/data/vehicles.json).
///
/// [fuel] est normalisé : essence | diesel | hybride | hybride-rechargeable |
/// electrique | gpl | e85.
class Vehicle {
  const Vehicle({
    required this.brand,
    required this.model,
    this.engine = '',
    required this.fuel,
    required this.consL100,
    this.unit = unitLiters,
    this.co2,
    this.powerHp,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) => Vehicle(
        brand: json['brand'] as String,
        model: json['model'] as String,
        engine: json['engine'] as String? ?? '',
        fuel: json['fuel'] as String,
        consL100: (json['consL100'] as num).toDouble(),
        unit: json['unit'] as String? ?? unitLiters,
        co2: (json['co2'] as num?)?.toInt(),
        powerHp: (json['powerHp'] as num?)?.toInt(),
      );

  /// Conso exprimée en litres aux 100 km.
  static const unitLiters = 'l';

  /// Conso exprimée en kWh aux 100 km (électriques).
  static const unitKwh = 'kwh';

  final String brand;
  final String model;

  /// Motorisation (« 1.0 TCe 90 »), parfois vide.
  final String engine;
  final String fuel;

  /// Conso mixte : l/100 km, ou kWh/100 km si [unit] vaut [unitKwh].
  final double consL100;
  final String unit;

  /// g CO₂/km (cycle mixte), absent pour la plupart des électriques.
  final int? co2;
  final int? powerHp;

  Map<String, dynamic> toJson() => {
        'brand': brand,
        'model': model,
        'engine': engine,
        'fuel': fuel,
        'consL100': consL100,
        'unit': unit,
        if (co2 != null) 'co2': co2,
        if (powerHp != null) 'powerHp': powerHp,
      };

  /// « RENAULT CLIO · 1.0 TCe 90 ».
  String get label =>
      engine.isEmpty ? '$brand $model' : '$brand $model · $engine';
}

/// Véhicule choisi par l'utilisateur, avec surcharge optionnelle de la
/// consommation réelle et du prix carburant. Persisté en JSON.
class VehicleSelection {
  const VehicleSelection({
    required this.vehicle,
    this.userConsL100,
    double? fuelPriceEurPerUnit,
  }) : _fuelPriceEurPerUnit = fuelPriceEurPerUnit;

  factory VehicleSelection.fromJson(Map<String, dynamic> json) =>
      VehicleSelection(
        vehicle: Vehicle.fromJson(json['vehicle'] as Map<String, dynamic>),
        userConsL100: (json['userConsL100'] as num?)?.toDouble(),
        fuelPriceEurPerUnit: (json['fuelPriceEurPerUnit'] as num?)?.toDouble(),
      );

  final Vehicle vehicle;

  /// Conso réelle saisie par l'utilisateur (même unité que le véhicule).
  final double? userConsL100;
  final double? _fuelPriceEurPerUnit;

  /// Prix carburant par défaut, €/l (€/kWh pour l'électrique).
  static double defaultFuelPrice(String fuel) => switch (fuel) {
        'diesel' => 1.75,
        'e85' => 0.95,
        'gpl' => 1.05,
        'electrique' => 0.20,
        _ => 1.85, // essence, hybride, hybride-rechargeable
      };

  /// kg de CO₂ émis par litre (ou kWh, mix France) consommé — utilisé quand
  /// le CO₂ constructeur manque.
  static double co2KgPerUnit(String fuel) => switch (fuel) {
        'diesel' => 2.68,
        'electrique' => 0.05,
        _ => 2.31, // essence et assimilés
      };

  /// Conso retenue pour les calculs : surcharge utilisateur sinon ADEME.
  double get consL100 => userConsL100 ?? vehicle.consL100;

  double get fuelPriceEurPerUnit =>
      _fuelPriceEurPerUnit ?? defaultFuelPrice(vehicle.fuel);

  /// Coût carburant en € pour 100 km.
  double get costPer100Km => consL100 * fuelPriceEurPerUnit;

  /// kg CO₂ par km — CO₂ constructeur si présent, sinon facteur carburant
  /// appliqué à la conso.
  double get co2PerKm {
    final gPerKm = vehicle.co2;
    if (gPerKm != null) return gPerKm / 1000;
    return consL100 * co2KgPerUnit(vehicle.fuel) / 100;
  }

  Map<String, dynamic> toJson() => {
        'vehicle': vehicle.toJson(),
        if (userConsL100 != null) 'userConsL100': userConsL100,
        if (_fuelPriceEurPerUnit != null)
          'fuelPriceEurPerUnit': _fuelPriceEurPerUnit,
      };
}
