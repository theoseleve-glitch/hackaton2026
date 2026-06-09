# Notes RGPD / vie privée — à traiter avant production

## Déjà en place

- Consentement explicite à l'onboarding avant tout usage du GPS
  (`consentAcceptedProvider`, colonnes `privacy_consent_accepted`,
  `location_consent_accepted` dans `profiles`).
- RLS : aucune donnée GPS/trajet d'un utilisateur n'est lisible par un autre.
- `analytics_events` : insertion seule côté client, jamais de lecture.
- Aucune clé/API secret hardcodée ; `.env` ignoré par git.

## À faire avant production

1. **Droit à l'effacement** : implémenter la suppression de compte
   (bouton présent dans Settings, non câblé). Cascade DB déjà prête
   (`on delete cascade` depuis auth.users).
2. **Minimisation** : définir une durée de rétention des `gps_track_points`
   (ex. agréger en stats puis purger les points bruts après 30 jours).
3. **Politique de confidentialité** : document légal + écran dédié,
   versionner le consentement (date + version acceptée).
4. **Consentement granulaire** : séparer analytics / GPS / marketing.
5. **DPA Supabase** : vérifier la région d'hébergement (EU) et signer le DPA.
6. **Anonymisation analytics** : user_id nullable — envisager de ne jamais
   le renseigner et d'utiliser un identifiant de session éphémère.
7. **Export des données** (portabilité, art. 20).
8. **Background tracking Android/iOS** : déclarations store spécifiques
   (ACCESS_BACKGROUND_LOCATION, NSLocationAlwaysUsageDescription) et
   justification d'usage.
