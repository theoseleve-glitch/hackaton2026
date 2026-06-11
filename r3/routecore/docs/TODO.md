# TODO

## Core
- [x] Routing réel : OsrmRoutingService (OSRM démo public, géométrie routière
      réelle, fallback mock hors-ligne) — MAP_PROVIDER=osrm
- [ ] Production : self-host OSRM ou passer sur Mapbox/ORS (le serveur démo
      OSRM est limité à un usage léger) ; géocodage réel (MapSearchService
      encore mock — brancher Nominatim/Mapbox Geocoding)
- [x] Carte réelle : flutter_map + tuiles OSM (écran carte L'Échappée)
- [ ] Production tuiles : passer sur un fournisseur avec SLA (MapTiler,
      Stadia…) — la policy OSM interdit le trafic lourd
- [ ] Lire les colonnes geography (WKB) dans SupabaseTripRepository._fromRow
      (actuellement labels seulement pour les listes)
- [ ] Persister UserProfile (consentements, mode préféré) vers Supabase
      depuis Settings/Onboarding
- [ ] Persistance des RouteOption en base : mapping dédié requis
      (uuid serveur + points PostGIS — le json local n'est pas le format DB)
- [ ] Migrer `anonKey` → `publishableKey` (dépréciation supabase_flutter)
- [ ] Suppression de compte (RGPD) — voir PRIVACY_NOTES.md
- [ ] Écran favoris (repository prêt, pas d'écran liste)

## Terroir
- [ ] Corridor POI sur vraie polyline (st_linefromencodedpolyline)
- [ ] Données horaires réelles → openingNow
- [ ] localAuthenticityScore / seasonalScore (données curatées)
- [ ] Back-office saisie POI (rôle admin déjà en DB)

## EcoDrive
- [ ] scoreSpeedLimit avec données de limites de vitesse
- [ ] Profils véhicule (conso réelle)
- [ ] Historique des trajets + progression
- [ ] Dashboard entreprise (agrégation partner_organizations)

## Infra
- [ ] CI (flutter analyze + test) sur la branche r3
- [x] iOS : projet généré + permissions localisation dans Info.plist
- [x] Permissions Android : ACCESS_FINE_LOCATION dans AndroidManifest
- [ ] Premier build iOS sur macOS (Xcode + `pod install` génèrent le Podfile ;
      vérifier le deployment target ≥ 13 exigé par geolocator/supabase)
- [ ] Icônes/launch screens spécifiques par produit (Terroir/EcoDrive)
