# Configuration du backend Supabase

## 1. Créer le projet

1. https://supabase.com → New project (région EU de préférence, RGPD).
2. Noter `Project URL` et `anon/publishable key` (Settings → API).

## 2. Appliquer les migrations

Option A — SQL Editor (rapide) : copier/exécuter dans l'ordre :
1. `supabase/migrations/0001_init.sql` (PostGIS, enums, tables, index)
2. `supabase/migrations/0002_rls.sql` (Row Level Security)
3. `supabase/migrations/0003_functions.sql` (nearby_pois, pois_along_route, create_trip, add_gps_track_point)
4. `supabase/seed.sql` (POI fictifs de démo)

Option B — CLI :
```
supabase link --project-ref <ref>
supabase db push
```

PostGIS est activé par la migration 0001 (`create extension if not exists postgis`).

## 3. RLS — résumé

- profiles : lecture/écriture par le propriétaire uniquement
- trips / gps_track_points / favorites / eco_scores : CRUD propriétaire
- pois / poi_categories : lecture par tout utilisateur connecté (POI vérifiés),
  écriture réservée au rôle `admin` (colonne `profiles.role`)
- analytics_events : insertion seule, aucune lecture client

Pour promouvoir un admin :
```sql
update profiles set role = 'admin' where email = 'vous@exemple.fr';
```

## 4. Auth

Email/mot de passe est activé par défaut. Pour le dev, désactiver
"Confirm email" (Authentication → Providers → Email) afin que signUp
connecte immédiatement.

## 5. Variables d'environnement

Dans `app/.env` (jamais commité) :
```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
```
Relancer l'app : les repositories basculent automatiquement sur Supabase.
