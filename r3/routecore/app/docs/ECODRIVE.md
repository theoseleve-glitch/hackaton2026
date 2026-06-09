# EcoDrive — méthodologie

Document de méthodologie du module **EcoDrive** (éco-conduite GPS) monté sur le core
**RouteCore**. Vue d'ensemble produit + parcours :
[`lib/product_modules/ecodrive/README.md`](../lib/product_modules/ecodrive/README.md).

> Les chiffres et seuils ci-dessous sont des **approximations pédagogiques (v1)**, pas
> des mesures certifiées. Ce document n'a pas valeur d'avis juridique ; une revue DPO est
> nécessaire avant tout déploiement réel (cf. §4 et §5).

Sommaire : (a) algorithme de scoring · (b) estimation carburant/CO2 · (c) mock vs
production · (d) vie privée / RGPD · (e) dashboard B2B (futur).

---

## (a) Algorithme de scoring — `EcoScoringEngine`

> **APPROX — heuristique v1.** Transforme une trace GPS (`List<GpsTrackPoint>`) en un
> éco-score /100 décomposé en sous-scores. Fonction **pure**, testable, sans I/O.

### Préparation des données

- **Vitesse par point** : `GpsTrackPoint.speedMps` si présent, sinon dérivée de la
  distance haversine / Δt entre deux points consécutifs.
- **Accélération longitudinale** : `a[i] = (v[i] − v[i-1]) / Δt` (m/s²). Approximation
  dérivée du GPS (cf. « comment améliorer »).
- **Trous d'enregistrement** : les intervalles `Δt > 30 s` sont **ignorés** (pause GPS,
  tunnel) pour ne pas fabriquer de fausses accélérations.

### Événements brusques (seuils)

| Événement | Seuil |
|---|---|
| Accélération brusque | `a > +2.0 m/s²` |
| Freinage brusque | `a < −2.5 m/s²` |

Les comptes sont normalisés **par kilomètre** pour ne pas pénaliser mécaniquement les
longs trajets.

### Sous-scores (0..100) et poids

Chaque sous-score part de 100, applique une pénalité, est clampé `[0, 100]` puis arrondi.

| Sous-score | Poids | Base |
|---|---|---|
| `acceleration` | **0.25** | pénalité ∝ accélérations brusques / km |
| `braking` | **0.25** | pénalité ∝ freinages brusques / km |
| `speedStability` | **0.20** | coefficient de variation de la vitesse (CV = σ/μ) ; conduite régulière = score haut |
| `routeEfficiency` | **0.20** | ratio distance réelle / distance de référence ; détour = pénalité |
| `speedCompliance` | **0.10** | fraction du trajet au-dessus de la limite (si limites connues) |

```
overall = Σ(score_i × poids_i) / Σ(poids_i présents)
```

**Renormalisation des poids** : si un sous-score est absent — typiquement
`speedCompliance` quand **aucune limite de vitesse** n'est disponible — son poids est
retiré du dénominateur et les poids restants sont **re-normalisés**. Résultat arrondi,
clampé `[0, 100]`.

### Mapping du conseil (un seul conseil)

Le conseil est dérivé du **sous-score le plus faible** :

| Sous-score le plus faible | Conseil (FR) |
|---|---|
| `acceleration` | « Accélérez plus progressivement pour économiser du carburant. » |
| `braking` | « Anticipez davantage pour éviter les freinages brusques. » |
| `speedStability` | « Maintenez une vitesse plus régulière (régulateur conseillé). » |
| `routeEfficiency` | « L'itinéraire éco était un peu plus long mais plus sobre. » |
| `speedCompliance` | « Évitez les pointes de vitesse inutiles. » |
| (score global élevé) | message positif (« Excellente conduite souple — continuez ainsi ! ») |

`speedCompliance` n'entre dans le choix du « plus faible » que s'il est présent.

### Comment améliorer (passage hors v1)

- **Fusion de capteurs** (accéléromètre + gyroscope + GPS) pour une accélération
  longitudinale fiable, au lieu de la dérivée GPS sensible au bruit.
- **Map-matching des limites de vitesse** (OSM/Overpass ou fournisseur) pour activer
  réellement `speedCompliance` au lieu de renormaliser son poids.
- **Vraie route de référence** pour `routeEfficiency` : comparer la trace map-matchée à
  l'itinéraire planifié (recouvrement, détours réels) plutôt qu'un simple ratio de
  distances.
- **Calibration** des seuils et coefficients sur données réelles, par type de véhicule et
  contexte (ville / route / autoroute) ; prise en compte pente / trafic / météo.

Tant que ces points ne sont pas adressés, l'éco-score est un **indicateur pédagogique**,
pas une note officielle.

---

## (b) Estimation carburant & CO2 — `FuelCo2Estimator`

> **APPROX — ce n'est PAS une mesure.** Aucune donnée OBD-II ni constructeur n'est lue.
> Tous les chiffres sont des estimations à partir de valeurs typiques (style ADEME) et
> d'une correction de vitesse heuristique. **Pas d'OBD, pas de télémétrie.**

### Baselines par véhicule — `EcoVehicleProfile.of(EcoVehicleType)`

Valeurs **APPROX**, ordre de grandeur cycle mixte (style ADEME) :

| `EcoVehicleType` | Conso de base | Facteur CO2 |
|---|---|---|
| `petrol` (essence) | **7.0 L/100km** | **2.31 kg CO2/L** |
| `diesel` | **6.0 L/100km** | **2.68 kg CO2/L** |
| `hybrid` (hybride) | **4.5 L/100km** | **2.31 kg CO2/L** (essence) |
| `van` (utilitaire) | **9.0 L/100km** | **2.68 kg CO2/L** (diesel) |
| `electric` (électrique) | **18 kWh/100km** | via réseau : `kEcoGridCo2KgPerKwh = 0.06 kg/kWh` |

Pour l'électrique : pas de litres ; `co2Kg = kWh × kEcoGridCo2KgPerKwh` (0.06 kg/kWh,
ordre de grandeur du mix France bas-carbone).

### Correction de vitesse (courbe en U, minimum ~70 km/h)

La conso réelle remonte en ville (stop-and-go) **et** à haute vitesse. Multiplicateur
appliqué à la conso de base :

```
m = 1 + 0.0008 × (v − 70)^2 / 10        // v en km/h
m = clamp(m, 0.85, 1.6)                 // au mieux −15 %, au pire +60 %
```

À ~70 km/h, `m ≈ 1.0` (conso = baseline). La même logique s'applique aux kWh pour
l'électrique.

### Carburant / CO2 « économisé »

- Par tronçon : `fuelLiters = baseConso × m(v) × distanceKm / 100`, puis
  `co2Kg = fuelLiters × facteurCO2` (ou voie réseau pour l'électrique).
- L'**économie** est la **différence** entre une option de référence (ex. la plus rapide)
  et une option candidate (ex. éco), pour le **même véhicule**. Valeur positive =
  économie ; négative = surcoût (l'option éco peut être plus longue, donc parfois
  consommer plus en absolu → l'UI affiche « perdu »).
- Stockée dans le résultat de scoring sous `estimatedFuelSavedLiters` /
  `estimatedCo2SavedKg`.

### Hypothèses & sources

- **Hypothèses** : véhicule en bon état, conduite « normale », pas de charge/remorque
  exceptionnelle, terrain ~plat, météo neutre, climatisation non modélisée. Vitesse
  moyenne dérivée de distance/durée (donc influencée par les arrêts).
- **Sources** : conso typiques et facteurs d'émission **style ADEME** (« Base
  Carbone ») + données constructeur génériques. Chiffres arrondis, choisis pour rester
  pédagogiques.

### Ce que ce n'est PAS

- **Pas une mesure** (aucune lecture OBD-II, aucun débit carburant réel).
- **Pas une analyse de cycle de vie** (pas de CO2 amont/fabrication ; l'électrique ne
  couvre que l'usage via le facteur réseau).
- **Pas calibré par modèle** : un même `EcoVehicleType` couvre des véhicules très variés.
- Pistes prod : OBD-II, facteurs officiels régionalisés (réseau électrique horaire),
  profils WLTP par modèle, prise en compte pente/trafic/charge/météo.

---

## (c) Mock vs Production

Légende : **MOCK** = factice/démo · **APPROX** = réel mais heuristique, non certifié ·
**PROD-ready** = implémentation de production (sous réserve de config). Le choix
MOCK ↔ PROD est piloté par la configuration : `AppConfig.demoMode == !Env.hasSupabase`,
et le routage/recherche par `Env.mapProvider` (défaut `mock`).

| Composant | Sélection | Classe |
|---|---|---|
| Routage (`MockRoutingService`) | défaut quand `MAP_PROVIDER` non défini | **MOCK** |
| Routage Mapbox / Google / OpenRouteService | si `MAP_PROVIDER` = `mapbox`/`google`/`openrouteservice` (+ clé) | **PROD-ready** |
| Recherche d'adresse (`MockMapSearchService`) | défaut ; mock **tant que `MAP_PROVIDER` non défini** | **MOCK** |
| Recherche d'adresse (`MapboxMapSearchService`) | si `MAP_PROVIDER` = `mapbox` | **PROD-ready** |
| Auth / repos en mémoire et mock (`MockAuthRepository`, `MockLocationRepository`, repos `Mock*`) | quand **pas de Supabase** (`demoMode`) | **MOCK** (repli démo, données volatiles) |
| Repos Supabase (`Supabase*Repository`) | quand `Env.hasSupabase` | **PROD-ready** |
| Analytics (`ConsoleAnalyticsRepository`) | quand pas de Supabase | **MOCK** (console, rien persisté) |
| Analytics (`SupabaseAnalyticsRepository`) | quand Supabase configuré | **PROD-ready** |
| Localisation (`GeolocatorLocationRepository`) | quand Supabase configuré (appareils réels) | **PROD-ready** |
| Éco-scoring (`EcoScoringEngine` / `BasicEcoDrivingScoringService`) | toujours | **APPROX (v1)** — voir §(a) |
| Estimation carburant/CO2 (`FuelCo2Estimator`, `EcoVehicleProfile`) | toujours | **APPROX** — voir §(b), **pas OBD** |

L'app tourne **entièrement hors-ligne sans aucune clé** (tout en MOCK) ; le scoring et le
carburant/CO2 restent **APPROX** quelle que soit la config.

---

## (d) Vie privée & RGPD

EcoDrive traite des **données de géolocalisation** (sensibles : elles révèlent
déplacements, lieux de vie, habitudes). Le produit est conçu autour du **consentement
explicite** et de la **minimisation**.

### Consentement de localisation (opt-in explicite)

- **Aucun suivi GPS ne démarre sans consentement explicite.** L'enregistrement de trajet
  n'est lancé qu'après une **permission de localisation accordée** ; la finalité est
  affichée **avant** la demande système.
- Les états refus / refus définitif / service désactivé sont gérés explicitement. Un refus
  **ne bloque pas l'app** : la comparaison d'itinéraires reste possible (la localisation
  live ne concerne que le suivi). Le consentement est traçable
  (`consentAcceptedProvider`).

### Minimisation des données

- On ne collecte que le nécessaire : points GPS d'un **trajet explicitement démarré**, le
  `Trip` et le score. Pas de collecte permanente en arrière-plan, pas de pistage
  publicitaire, pas d'identifiants tiers.
- L'**analytics reste événementiel et non identifiant** (noms d'événements + propriétés
  utiles, sans positions fines).

### Cloisonnement propriétaire (owner-scoped)

- Toutes les données GPS / trajet sont **rattachées au propriétaire** (`userId`). En
  production Supabase, l'accès est restreint par **RLS propriétaire-only** (un utilisateur
  ne lit/écrit que ses propres lignes). En démo, les données restent en mémoire locale et
  ne quittent pas l'appareil.
- Droits RGPD servables par l'architecture : accès/portabilité (`toJson`), effacement,
  opposition (désactiver le suivi, retirer le consentement à tout moment).
- **Aucun secret en dur** : toute clé passe par `Env` (`.env`), jamais committée.

### Risque B2B — surveillance des salariés (et mitigations)

Le dashboard flotte (FUTUR, §(e)) crée un risque majeur : utiliser à tort l'éco-conduite
pour **surveiller individuellement des salariés**. En France : Code du travail,
jurisprudence **CNIL**, prérogatives du **comité social et économique (CSE)**.

Mitigations à intégrer **dès la conception** :

- **Finalité limitée et déclarée** : amélioration de l'éco-conduite / réduction des
  émissions — **pas** la surveillance individuelle continue (limitation des finalités).
- **Anonymisation / agrégation par défaut** : restituer des indicateurs agrégés (moyenne
  flotte, par véhicule) ; n'exposer le niveau conducteur que si strictement justifié et
  encadré.
- **Transparence conducteur** : information préalable claire (quoi, pourquoi, qui y
  accède) ; pas de collecte cachée ; **opt-out** réel.
- **Proportionnalité** : pas de géolocalisation hors trajets professionnels ni hors temps
  de travail.
- **Consultation du CSE** et **AIPD** ; respect des recommandations **CNIL** sur la
  géolocalisation des véhicules d'employés.
- **Pas d'usage disciplinaire automatisé** fondé sur un score qui reste **APPROX** (§(a)).

---

## (e) Dashboard B2B flotte (FUTUR)

> **NON construit dans le MVP — seul le modèle de données est préparé.** Aucun écran,
> provider, métrique calculée ni export n'est livré. La structure DB est anticipée
> (cf. `partner_organizations`). Rappel des garde-fous RGPD : §(d).

### Modèle de données (préparé, pas implémenté)

| Entité | Champs clés |
|---|---|
| Organisation | `id`, `name`, `plan`, `created_at` |
| Flotte | `id`, `organization_id`, `name` |
| Véhicule | `id`, `fleet_id`, `label`, `vehicle_type`, `plate` |
| Conducteur | `id`, `organization_id`, `user_id` (nullable), `display_name` |
| Affectation | `vehicle_id` → `driver_id` → `trip_id` |
| Trajet | tables MVP `trips` (rattachées à un `user_id`) |
| Éco-score | `score_overall`, `estimated_fuel_saved_liters`, `estimated_co2_saved_kg` (par `trip_id`) |
| CO2 / carburant | dérivés des éco-scores |
| Rapport mensuel | `organization_id`, `period_month`, `avg_eco_score`, `total_distance_meters`, `fuel_saved_liters`, `co2_saved_kg`, `payload` (jsonb) |

Liaison : un trajet → véhicule → flotte → organisation via les affectations ; l'éco-score
fournit score et économies ; les rapports mensuels **pré-agrègent** par organisation et
par mois.

### Métriques prévues

- **Score d'éco-conduite moyen de la flotte** (global + tendance).
- **Détail par conducteur** et **par véhicule** (sous garde-fous RGPD §(d)).
- **Distance totale parcourue** sur la période.
- **Carburant économisé** (L) et **CO2 économisé** (kg), agrégés.
- **Amélioration dans le temps** : évolution mois après mois, période N vs N−1.
- Répartitions : par type de véhicule, par flotte, par région.

### Exports & restitution

- **Export CSV** : tableaux par conducteur / véhicule / mois.
- **Export PDF** : rapport mensuel mis en forme (synthèse + tendances).
- N'existent pas dans le MVP ; le format `payload` (jsonb) est prévu pour les alimenter.

### Contexte tarifaire

`organizations.plan` portera des **paliers** (ex. `free` / `pro` / `enterprise`)
conditionnant nombre de véhicules/conducteurs, profondeur d'historique, exports,
fréquence des rapports. **Aucune logique de facturation dans le MVP** ; seule la colonne
`plan` est prévue.

> **Statut : NON construit dans le MVP — modèle de données préparé uniquement.**
