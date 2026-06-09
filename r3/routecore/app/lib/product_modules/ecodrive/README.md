# Module EcoDrive

Assistant d'**éco-conduite GPS** monté sur le core partagé **RouteCore**. Il aide à
**choisir** un itinéraire sobre (comparaison rapide / court / éco), **suit** le trajet
réel par GPS, puis **note** la conduite (éco-score /100), **estime** carburant et CO2,
et donne **un** conseil.

> Méthodologie détaillée (scoring, carburant/CO2, mock vs prod, RGPD, B2B) :
> [`docs/ECODRIVE.md`](../../../docs/ECODRIVE.md).

---

## 1. Frontière EcoDrive-only

Toute la logique « sobriété » vit **uniquement** dans
`lib/product_modules/ecodrive/`. Ce module :

- ne contient **aucune** logique Terroir et n'importe **jamais**
  `product_modules/terroir/` ;
- **ne pollue pas le core** : il consomme `core/`, `shared/` et `features/*` sans y
  ajouter de code spécifique éco. Les seules « rallonges » côté core sont des points
  d'extension neutres (notamment `ScoringService`) et l'enum `ProductContext.ecodrive`.

Inversement, le core reste agnostique : il ne connaît EcoDrive qu'à travers
`ProductContext` et l'interface `ScoringService`.

---

## 2. Parcours utilisateur

```
/home  →  /ecodrive/compare  →  /tracking/:id  →  /summary/:id
                                                       └→ /ecodrive/dashboard
```

| Étape | Écran / route | Rôle |
|---|---|---|
| Accueil | `/home` (core) | Saisie départ/destination, lancement comparaison |
| Comparaison | `EcoCompareScreen` — `/ecodrive/compare` | 3 options (rapide/court/éco) + sélecteur de véhicule + carburant/CO2 **par véhicule** ; crée un `Trip` (`ProductContext.ecodrive`) et navigue vers le tracking |
| Suivi GPS | `/tracking/:id` (core) | Enregistrement du trajet ; **aucun jugement affiché pendant la conduite** |
| Résumé | `/summary/:id` (core) | Affiche l'**éco-score** automatiquement (voir §4) |
| Dashboard | `EcoDashboardScreen` — `/ecodrive/dashboard` | Sous-scores + carburant/CO2 + carburant/CO2 « économisé » |

Les écrans `compare` et `dashboard` sont déclarés dans `app/router.dart`.

---

## 3. Fichiers du module

```
product_modules/ecodrive/
├── README.md                         ← ce fichier
├── domain/
│   ├── eco_driving_analyzer.dart      ← EcoVehicleType, EcoVehicleProfile,
│   │                                    FuelCo2Estimator, EcoScoringEngine,
│   │                                    BasicEcoDrivingScoringService
│   └── …                              ← logique éco pure (testable, sans I/O)
└── presentation/
    └── ecodrive_screens.dart          ← EcoCompareScreen, EcoDashboardScreen
```

Classes clés du domaine :

- `EcoVehicleType` { petrol, diesel, hybrid, electric, van } + `EcoVehicleProfile.of(type)`
  (baselines conso & CO2 par type).
- `FuelCo2Estimator` — carburant/CO2 par tronçon, avec correction de vitesse en U
  (minimum ~70 km/h). **APPROX, pas une mesure, pas d'OBD.**
- `EcoScoringEngine` — 5 sous-scores depuis la trace GPS (accélération, freinage,
  stabilité de vitesse, efficacité d'itinéraire, respect des limites).
- `BasicEcoDrivingScoringService implements ScoringService` — adaptateur vers le point
  d'extension du core ; renvoie un `TripScoreResult { scoreOverall, adviceText, metrics }`.

---

## 4. Branchement sur le core via `ScoringService`

Le core expose un point d'extension neutre :
`features/scoring/domain/scoring_service.dart` (`abstract class ScoringService` →
`TripScoreResult`). EcoDrive l'implémente avec `BasicEcoDrivingScoringService`.

L'aiguillage se fait dans `app/providers.dart` : `scoringServiceProvider` devient
**conscient du mode produit** —

```
scoringServiceProvider == BasicEcoDrivingScoringService
    quand productModeProvider == ProductContext.ecodrive
sinon                       == BasicTripScoringService  (placeholder neutre du core)
```

Conséquence : l'écran **partagé** `/summary/:tripId` affiche automatiquement l'éco-score
sans connaître EcoDrive. Le `dashboard` réutilise le même service pour le détail des
sous-scores et des estimations.

**Métriques exposées** dans `TripScoreResult.metrics` : `harshAccelerationCount`,
`harshBrakingCount`, `averageSpeed`, `speedVariance`, `fuelEstimate`, `co2Estimate`,
`scoreAcceleration` / `scoreBraking` / `scoreSpeedStability` / `scoreRouteEfficiency` /
`scoreSpeedCompliance`, `estimatedFuelSavedLiters`, `estimatedCo2SavedKg`, `vehicleType`.

---

## 5. Analytics

EcoDrive logue ses événements via `analyticsRepositoryProvider` avec
`ProductContext.ecodrive` (ex. `eco_score_viewed`). 6 événements conceptuels :
recherche d'itinéraire lancée, option sélectionnée, trajet démarré, trajet terminé,
score consulté, conseil consulté.

---

## 6. Hors-ligne / démo

L'app tourne **sans Supabase ni clé d'API** : `MockRoutingService`,
`MockAuthRepository`, `MockLocationRepository`, `ConsoleAnalyticsRepository`.
`AppConfig.demoMode == !Env.hasSupabase`. Le scoring et l'estimation carburant/CO2
sont **APPROX v1** (heuristiques), indépendants de la config. Voir
[`docs/ECODRIVE.md`](../../../docs/ECODRIVE.md) §3.
