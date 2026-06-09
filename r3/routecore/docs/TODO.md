# TODO

## Core
- [ ] Implémenter un vrai provider (Mapbox conseillé) : MapSearchService +
      RoutingService + décodeur de polyline encodée
- [ ] Remplacer le placeholder carte par flutter_map ou mapbox_maps_flutter
- [ ] Lire les colonnes geography (WKB) dans SupabaseTripRepository._fromRow
      (actuellement labels seulement pour les listes)
- [ ] Persister UserProfile (consentements, mode préféré) vers Supabase
      depuis Settings/Onboarding
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
- [ ] iOS : `flutter create --platforms=ios` + permissions Info.plist
- [ ] Permissions Android : ACCESS_FINE_LOCATION dans AndroidManifest
