import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/vehicle/data/vehicle_repository.dart';
import 'package:routecore/features/vehicle/domain/vehicle.dart';

void main() {
  const clio = Vehicle(
    brand: 'RENAULT',
    model: 'CLIO',
    engine: '1.0 TCe 90',
    fuel: 'essence',
    consL100: 5.0,
    co2: 114,
    powerHp: 91,
  );

  group('Vehicle JSON', () {
    test('roundtrip complet', () {
      final copy = Vehicle.fromJson(clio.toJson());
      expect(copy.brand, 'RENAULT');
      expect(copy.model, 'CLIO');
      expect(copy.engine, '1.0 TCe 90');
      expect(copy.fuel, 'essence');
      expect(copy.consL100, 5.0);
      expect(copy.unit, Vehicle.unitLiters);
      expect(copy.co2, 114);
      expect(copy.powerHp, 91);
    });

    test('champs optionnels absents -> valeurs par défaut', () {
      final v = Vehicle.fromJson(
        {'brand': 'X', 'model': 'Y', 'fuel': 'essence', 'consL100': 5},
      );
      expect(v.engine, '');
      expect(v.unit, Vehicle.unitLiters);
      expect(v.co2, isNull);
      expect(v.powerHp, isNull);
      // co2/powerHp absents du JSON compact.
      expect(v.toJson().containsKey('co2'), isFalse);
      expect(v.toJson().containsKey('powerHp'), isFalse);
    });

    test('roundtrip de la sélection avec surcharges', () {
      const selection = VehicleSelection(
        vehicle: clio,
        userConsL100: 6.2,
        fuelPriceEurPerUnit: 1.99,
      );
      final copy = VehicleSelection.fromJson(selection.toJson());
      expect(copy.vehicle.label, clio.label);
      expect(copy.userConsL100, 6.2);
      expect(copy.fuelPriceEurPerUnit, 1.99);
    });
  });

  group('costPer100Km', () {
    test('essence au prix par défaut (1.85 €/l)', () {
      expect(
        const VehicleSelection(vehicle: clio).costPer100Km,
        closeTo(9.25, 1e-9),
      );
    });

    test('la surcharge utilisateur remplace la conso ADEME', () {
      expect(
        const VehicleSelection(vehicle: clio, userConsL100: 6.0).costPer100Km,
        closeTo(11.10, 1e-9),
      );
    });

    test('électrique en €/kWh (0.20)', () {
      const tesla = Vehicle(
        brand: 'TESLA',
        model: 'MODEL 3',
        fuel: 'electrique',
        consL100: 16.0,
        unit: Vehicle.unitKwh,
      );
      expect(
        const VehicleSelection(vehicle: tesla).costPer100Km,
        closeTo(3.20, 1e-9),
      );
    });

    test('prix par défaut selon carburant', () {
      expect(VehicleSelection.defaultFuelPrice('essence'), 1.85);
      expect(VehicleSelection.defaultFuelPrice('diesel'), 1.75);
      expect(VehicleSelection.defaultFuelPrice('e85'), 0.95);
      expect(VehicleSelection.defaultFuelPrice('gpl'), 1.05);
      expect(VehicleSelection.defaultFuelPrice('electrique'), 0.20);
      expect(VehicleSelection.defaultFuelPrice('hybride'), 1.85);
    });
  });

  group('co2PerKm', () {
    test('le CO₂ constructeur est prioritaire', () {
      expect(
        const VehicleSelection(vehicle: clio).co2PerKm,
        closeTo(0.114, 1e-9),
      );
    });

    test('fallback essence : 2.31 kg/l', () {
      const v = Vehicle(brand: 'X', model: 'Y', fuel: 'essence', consL100: 5.0);
      expect(
        const VehicleSelection(vehicle: v).co2PerKm,
        closeTo(0.1155, 1e-9),
      );
    });

    test('fallback diesel : 2.68 kg/l', () {
      const v = Vehicle(brand: 'X', model: 'Y', fuel: 'diesel', consL100: 4.8);
      expect(
        const VehicleSelection(vehicle: v).co2PerKm,
        closeTo(0.12864, 1e-9),
      );
    });

    test('fallback électrique : 0.05 kg/kWh (mix France)', () {
      const v = Vehicle(
        brand: 'X',
        model: 'Y',
        fuel: 'electrique',
        consL100: 16.0,
        unit: Vehicle.unitKwh,
      );
      expect(
        const VehicleSelection(vehicle: v).co2PerKm,
        closeTo(0.008, 1e-9),
      );
    });
  });

  group('search', () {
    const fixture = [
      Vehicle(brand: 'RENAULT', model: 'CLIO', engine: '1.0 TCe 90', fuel: 'essence', consL100: 5.0),
      Vehicle(brand: 'RENAULT', model: 'MÉGANE', engine: '1.3 TCe 140', fuel: 'essence', consL100: 5.9),
      Vehicle(brand: 'CITROËN', model: 'C3', engine: 'PureTech 83', fuel: 'essence', consL100: 5.2),
      Vehicle(brand: 'HYUNDAI', model: 'TRENDY', engine: '', fuel: 'essence', consL100: 6.0),
      Vehicle(brand: 'PEUGEOT', model: '208', engine: 'BlueHDi 100', fuel: 'diesel', consL100: 4.0),
    ];
    final repo = VehicleRepository(vehicles: fixture);

    test('préfixe de marque classé avant simple contenance', () async {
      // « ren » : préfixe de RENAULT, contenu dans TRENDY.
      final results = await repo.search('ren');
      expect(results.length, 3);
      expect(results[0].brand, 'RENAULT');
      expect(results[1].brand, 'RENAULT');
      expect(results[2].model, 'TRENDY');
    });

    test('insensible à la casse et aux accents', () async {
      expect((await repo.search('citroen')).single.model, 'C3');
      expect((await repo.search('megane')).single.model, 'MÉGANE');
      expect((await repo.search('CLIO')).single.model, 'CLIO');
    });

    test('multi-mots : marque + modèle + motorisation', () async {
      expect((await repo.search('renault clio')).single.model, 'CLIO');
      expect((await repo.search('bluehdi')).single.model, '208');
      expect(await repo.search('renault bluehdi'), isEmpty);
    });

    test('requête vide ou sans correspondance -> rien', () async {
      expect(await repo.search(''), isEmpty);
      expect(await repo.search('   '), isEmpty);
      expect(await repo.search('zorglub'), isEmpty);
    });

    test('limite du nombre de résultats', () {
      final many = [
        for (var i = 0; i < 40; i++)
          Vehicle(brand: 'RENAULT', model: 'M$i', fuel: 'essence', consL100: 5),
      ];
      expect(VehicleRepository.rank(many, 'renault').length, 30);
      expect(VehicleRepository.rank(many, 'renault', limit: 5).length, 5);
    });

    test('liste des marques distinctes triées', () async {
      expect(
        await repo.brands(),
        ['CITROËN', 'HYUNDAI', 'PEUGEOT', 'RENAULT'],
      );
    });
  });
}
