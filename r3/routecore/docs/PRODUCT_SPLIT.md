# Répartition Core / Terroir / EcoDrive

## Commun (NE PAS modifier sans accord des deux devs)

- `app/lib/core/**`, `app/lib/shared/**`, `app/lib/features/**`
- `app/lib/app/providers.dart`, `router.dart` (section core), `theme.dart`
- `supabase/migrations/**` (schéma partagé)
- Modèles : UserProfile, GeoPoint, RouteRequest/Option, Trip, GpsTrackPoint,
  Poi, PoiCategory, PoiAlongRoute, Favorite, EcoScore, AnalyticsEvent
- Interfaces : Auth/User/Location/Routing(Service)/Poi/Trip/Tracking/
  Favorite/Analytics repositories, ScoringService, MapSearchService

## Waze Terroir (dev A) — `app/lib/product_modules/terroir/`

- `domain/terroir_relevance_scorer.dart` : score de pertinence POI
  (poiRelevanceScore, detourMinutes, sponsoredRankBoost + placeholders
  openingNow, localAuthenticityScore, seasonalScore)
- `domain/discovery_scoring_service.dart` : score découverte (placeholder)
- `domain/terroir_analytics.dart` : événements analytics du module
- `presentation/terroir_screens.dart` : TerroirPlanScreen (détour 10/20/45,
  type d'expérience), TerroirResultsScreen (POI classés, badge Partenaire)
- Routes : `/terroir/plan`, `/terroir/results`
- Analytics : `terroir_route_generated`
- DB dédiée : `sponsored_placements`, `partner_organizations`,
  catégories `product_context='terroir'`
- Monétisation préparée SANS paiement : `is_sponsored`, `rank_boost`

## GPS Écoconduite (dev B) — `app/lib/product_modules/ecodrive/`

- `domain/eco_driving_analyzer.dart` : EcoDrivingAnalyzer (accélérations/
  freinages brusques, vitesse moyenne, variance, carburant/CO2),
  BasicEcoDrivingScoringService (score /100 + conseil principal)
- `domain/ecodrive_analytics.dart` : événements analytics du module
- `presentation/ecodrive_screens.dart` : EcoCompareScreen (rapide/court/éco),
  EcoDashboardScreen (conducteur ; carte "entreprise" en placeholder)

### Point d'assemblage core ↔ modules

`app/lib/app/product_registry.dart` (comme router.dart) : les écrans core
(Home, TripSummary) lisent ce registre au lieu de connaître les produits.
Pour brancher un module sur l'accueil : ajoutez une `ProductHomeEntry`.
- Routes : `/ecodrive/compare`, `/ecodrive/dashboard`
- Analytics : `eco_score_viewed`
- DB dédiée : `eco_scores` (+ `metrics` jsonb extensible)
- Futur SaaS B2B : agrégation par `partner_organizations` (structure prête)

## Travailler en parallèle sans conflit

1. Chaque dev ne modifie que SON dossier `product_modules/<x>/`.
2. Le router : chaque module a son bloc de routes clairement délimité —
   ajoutez vos routes dans votre bloc uniquement.
3. Besoin d'un changement core ? → PR séparée, revue par l'autre dev,
   jamais mélangée à une feature produit.
4. Migrations : fichiers numérotés ; préfixez les vôtres (`0004_terroir_x.sql`,
   `0005_ecodrive_x.sql`) et n'éditez jamais une migration appliquée.
5. Branches suggérées : `r3-terroir/*` et `r3-ecodrive/*` à partir de `r3`.

## Checklist « ready for Waze Terroir MVP »

- [x] Flux découverte : plan (détour+préférences) → POI classés → fiche POI
- [x] Score de pertinence + boost sponsorisé borné
- [x] Seed POI terroir + catégories
- [x] Analytics terroir_route_generated / poi_viewed / poi_favorited
- [ ] Vraie polyline (provider carto) pour le corridor POI
- [ ] Fiches partenaires enrichies (photos, horaires réels)
- [ ] Back-office de saisie POI (admin)

## Checklist « ready for GPS Écoconduite MVP »

- [x] Comparaison rapide/court/éco avec CO2/carburant
- [x] Tracking GPS + détection accél./freinages brusques
- [x] Éco-score /100 + conseil principal
- [x] Dashboard conducteur
- [ ] Données de limites de vitesse (scoreSpeedLimit réel)
- [ ] Profils véhicule (consommation réelle par type)
- [ ] Dashboard entreprise (agrégation par organisation)
