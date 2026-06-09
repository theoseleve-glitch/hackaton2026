# RouteCore Platform

Socle technique commun pour deux applications mobiles :

- **Waze Terroir** — GPS de découverte locale (producteurs, marchés, artisans, villages…)
- **GPS Écoconduite** — GPS orienté sobriété (comparaison rapide/court/éco, éco-score)

Les deux apps partagent : auth, profils, géolocalisation, carte, recherche d'adresse,
calcul d'itinéraire (abstrait), trajets, tracking GPS, POI, favoris, scoring, analytics.

## Structure

```
r3/routecore/
  app/                  # application Flutter (RouteCore)
    lib/
      app/              # bootstrap, router, theme, providers (DI)
      core/             # env, erreurs, logging, permissions, constantes
      shared/           # modèles + services neutres (MapSearch, Routing)
      features/         # auth, location, map, routing, poi, trips, tracking,
                        # favorites (dans trips), scoring, analytics, settings
      product_modules/
        terroir/        # spécifique Waze Terroir
        ecodrive/       # spécifique GPS Écoconduite
    test/
  supabase/
    migrations/         # 0001 schéma+PostGIS, 0002 RLS, 0003 fonctions SQL
    seed.sql            # POI fictifs de démo
  docs/                 # ARCHITECTURE, BACKEND_SETUP, ROADMAP, PRODUCT_SPLIT,
                        # PRIVACY_NOTES, TODO
```

## Installation

1. Installer [Flutter](https://docs.flutter.dev/get-started/install) (≥ 3.44).
2. `cd r3/routecore/app && flutter pub get`
3. **Obligatoire** — copier `.env.example` vers `.env` (sinon le build échoue
   avec `unable to locate asset entry: .env`, car le fichier est bundlé comme
   asset pour Android/iOS) :

```
SUPABASE_URL=            # vide = mode démo complet (mocks)
SUPABASE_ANON_KEY=
MAP_PROVIDER=mock        # mock / mapbox / google / openrouteservice
MAPBOX_ACCESS_TOKEN=
GOOGLE_MAPS_API_KEY=
OPENROUTESERVICE_API_KEY=
```

4. `flutter run` (Android, iOS, Windows). **Sans aucune configuration, l'app
   tourne en mode démo** : auth mock, POI mock, routing mock, GPS simulé
   Lyon→Vienne.

> iOS : le dossier `ios/` est prêt (permissions localisation incluses dans
> `Info.plist`), mais le build nécessite un Mac avec Xcode — le premier
> `flutter run` sur macOS exécutera `pod install` automatiquement.

## Commandes utiles

```
flutter analyze     # lint
flutter test        # tests unitaires (modèles, scoring, mocks)
flutter run -d windows
```

## Connecter Supabase

Voir `docs/BACKEND_SETUP.md`. En résumé : créer un projet Supabase, appliquer
les 3 migrations + le seed, renseigner `SUPABASE_URL`/`SUPABASE_ANON_KEY` dans
`.env`. Tous les repositories basculent automatiquement du mock vers Supabase.

## Changer de map provider

`MAP_PROVIDER` dans `.env`. `mock` est complet ; `mapbox`/`google`/
`openrouteservice` sont des placeholders à implémenter dans
`lib/shared/services/` (les interfaces `MapSearchService` et `RoutingService`
sont stables). Aucune clé n'est hardcodée.

## État actuel

- ✅ App compile (Android/iOS/Windows scaffoldés), `flutter analyze` propre, 15 tests verts
- ✅ 11 écrans navigables + écrans Terroir (plan/résultats) et EcoDrive (comparaison/dashboard)
- ✅ Migrations PostGIS + RLS + fonctions SQL + seed
- 🔶 Mocké : routing, recherche d'adresse, GPS desktop, carte (placeholder CustomPaint)
- 🔶 À brancher pour la prod : vrai provider carto, vraie carte, suppression de compte (RGPD)
