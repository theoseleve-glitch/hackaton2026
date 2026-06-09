# Architecture RouteCore

## Principes

- **Core neutre** : `core/`, `shared/`, `features/` ne contiennent aucune
  logique métier Terroir ou EcoDrive. Tout ce qui est spécifique vit dans
  `product_modules/` ou derrière une interface.
- **Domain / Data / Presentation** par feature :
  - `domain/` : interfaces de repository + services purs (testables)
  - `data/` : implémentations Supabase + mocks
  - `presentation/` : écrans + providers Riverpod
- **Pas de codegen** (freezed/json_serializable écartés volontairement) :
  classes immuables manuelles → zéro friction de build pour un hackathon.
  Migration possible plus tard sans toucher aux interfaces.

## Injection de dépendances

`lib/app/providers.dart` est le point unique de câblage. Chaque provider
choisit `Supabase*Repository` si `.env` contient une URL Supabase, sinon le
mock. `MAP_PROVIDER` sélectionne le service carto.

## Modèle de données (Supabase/PostgreSQL/PostGIS)

profiles ─1:1─ auth.users
poi_categories ─< pois ─< sponsored_placements >─ partner_organizations
trips ─< route_options, gps_track_points, eco_scores
favorites (user_id, target_type[poi|route|trip], target_id)
analytics_events (write-only côté client)

Colonnes géo : `geography(Point,4326)` + index GIST.

## Flux utilisateur

Splash → Onboarding (consentement + choix de mode) → Login → Home
→ (calcul d'itinéraire) → RouteOptions → création Trip → Tracking → Summary
Modules : Home → Terroir plan → résultats POI classés ; Home → EcoDrive
comparaison → tracking → dashboard.

## POI le long du trajet — limites MVP

`pois_along_route()` (SQL) et `MockPoiRepository.poisAlongRoute` utilisent un
**corridor autour du segment droit origine→destination**, pas la vraie
polyline. Conséquence : sur un itinéraire très sinueux, des POI proches de la
route réelle peuvent être manqués. Évolution prévue : passer la polyline
encodée du provider à `st_linefromencodedpolyline` et mesurer la distance à la
ligne réelle — l'interface `PoiRepository.poisAlongRoute` ne changera pas.
L'estimation `detourMinutesEstimate` (distance×2 à ~30 km/h) est volontairement
grossière.

## Scoring

`ScoringService` (core, neutre) → `BasicTripScoringService` (régularité de
vitesse). Les scorers produit (`BasicEcoDrivingScoringService`,
`TerroirRelevanceScorer`, `BasicDiscoveryScoringService`) vivent dans leurs
modules et réutilisent les types du core (`TripScoreResult`, `PoiAlongRoute`).

## Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| State | Riverpod (Notifier) | testable, DI intégrée |
| Navigation | go_router | routes déclaratives, deep links |
| Backend | Supabase + RLS | auth+DB+storage sans serveur custom |
| Carte | placeholder CustomPaint | aucun verrouillage provider ; interface stable |
| Modèles | classes manuelles | pas de build_runner |
