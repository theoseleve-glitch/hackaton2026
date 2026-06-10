# Design System L'Échappée

> « Le GPS des routes qui respirent. »

Ce document est la référence du design system du produit **L'Échappée**, hébergé
dans le module `app/lib/product_modules/echappee/design_system/`. Tout écran du
module doit consommer ces tokens et composants — jamais de couleur, d'espacement
ou de radius en dur.

Import unique :

```dart
import 'package:routecore/product_modules/echappee/design_system/design_system.dart';
```

---

## 1. Principes de marque

- **Nom** : L'Échappée
- **Tagline** : « Le GPS des routes qui respirent. »
- **Formule** : 70 % Mobile / 20 % Douce / 10 % Premium — une app de navigation
  d'abord, adoucie par une esthétique chaleureuse, relevée d'une touche premium
  (typographie serif, ombres papier, dorures discrètes).
- **Personnalité** : calme, clair, curieux, local, premium accessible.

L'Échappée n'est pas un GPS qui presse : c'est un compagnon de route qui invite
à prendre le temps. L'interface doit toujours donner une impression de papier
chaud posé sur la carte — fond crème, cards blanc cassé arrondies, ombres
douces. Jamais enfantin, jamais agressif.

---

## 2. Palette

Source de vérité : `echappee_colors.dart` (`EchappeeColors`).

### Palette principale (12 couleurs)

| Token | Nom | Hex | Usage |
|---|---|---|---|
| `primary` | Clay Red | `#D95F45` | CTA, route active, sélection |
| `background` | Warm Cream | `#FFF7EA` | Fond principal de l'app |
| `surface` | Soft White | `#FFFCF5` | Cards, panels, inputs |
| `textPrimary` | Deep Brown | `#2B211C` | Texte principal |
| `textSecondary` | Stone Taupe | `#8A7C70` | Texte secondaire, métadonnées |
| `nature` | Olive | `#6F7F45` | Nature, producteurs, lieux vérifiés |
| `accent` | Soft Gold | `#D9A441` | Badges, coups de cœur, partenaires |
| `mapAccent` | Mist Blue | `#7EA8A4` | Carte, eau, routes secondaires |
| `success` | Leaf Green | `#587A3A` | Validation, « Ouvert », succès |
| `error` | Deep Red | `#B64035` | Erreurs, danger, « Fermé » |
| `border` | Warm Stone | `#E7D8C8` | Contours doux des cards et inputs |
| `disabled` | Pale Taupe | `#C9BBAE` | États désactivés |

### Variantes d'état

| Token | Hex | Usage |
|---|---|---|
| `primaryPressed` | `#BE4F37` | Clay Red pressé (CTA enfoncé) |
| `primaryTint` | `#F9E5DE` | Fond d'une card sélectionnée |
| `accentTint` | `#33D9A441` (Soft Gold 20 %) | Fond du badge « Partenaire local » |
| `surfaceElevated` | `#FFFEFB` | Card élevée, blanc légèrement cassé |
| `mapOverlay` | `#F5FFFCF5` (Soft White 96 %) | Overlays denses posés sur la carte |
| `darkOverlay` | `#662B211C` (Deep Brown 40 %) | Barrière de modale, scrims |

### Couleurs fonctionnelles — routes

| Token | Alias de | Usage |
|---|---|---|
| `routeDirect` | `textSecondary` | Trajet direct (pointillé taupe) |
| `routeEchappee` | `primary` | Échappée recommandée |
| `routeAlternative` | `mapAccent` | Alternative |
| `routeWalking` | `nature` | Segment local / à pied |

### Couleurs fonctionnelles — catégories et statuts

| Token | Alias de |
|---|---|
| `categoryProducteurs` | `nature` |
| `categoryMarches` | `accent` |
| `categoryVillages` | `primary` |
| `categoryArtisans` | `textPrimary` |
| `categoryPointsDeVue` | `mapAccent` |
| `categoryBonnesTables` | `primary` |
| `categoryNature` | `success` |
| `categoryEvenements` | `accent` |
| `statusOpen` | `success` (« Ouvert ») |
| `statusClosed` | `error` (« Fermé ») |

---

## 3. Typographie

Source de vérité : `echappee_typography.dart` (`EchappeeTypography`).

Deux voix typographiques, deux rôles :

- **Fraunces (serif) = l'émotion.** Onboarding, landing, empty states, moments
  forts (« Ton échappée est prête. »). Jamais pour la micro-UI.
- **Inter (sans-serif) = la clarté.** UI courante, inputs, cards, navigation,
  métadonnées, boutons.

### Échelle complète

| Token | Police | Taille / interligne | Graisse | Couleur par défaut | Usage |
|---|---|---|---|---|---|
| `display` | Fraunces | 40 / 46 | SemiBold (600) | `textPrimary` | Landing, hero |
| `h1` | Fraunces | 32 / 38 | SemiBold (600) | `textPrimary` | Onboarding, écrans clés |
| `h2` | Fraunces | 26 / 32 | SemiBold (600) | `textPrimary` | Titres de section |
| `h3` | Inter | 20 / 26 | Bold (700) | `textPrimary` | Cards, sections d'écran |
| `bodyLarge` | Inter | 17 / 25 | Regular (400) | `textPrimary` | Paragraphes |
| `body` | Inter | 15 / 22 | Regular (400) | `textPrimary` | UI principale |
| `bodySmall` | Inter | 13 / 18 | Regular (400) | `textSecondary` | Métadonnées |
| `caption` | Inter | 12 / 16 | Medium (500) | `textSecondary` | Badges, labels |
| `button` | Inter | 16 / 20 | SemiBold (600) | `surface` | CTA |

### Installation des polices

Les fichiers `.ttf` **ne sont pas embarqués dans le dépôt** (gestion des
licences). Tant qu'ils sont absents, les fallbacks système prennent le relais :
**Georgia / Times New Roman** pour Fraunces, **Segoe UI / Roboto** pour Inter.
L'app reste fonctionnelle, mais la voix de marque n'est complète qu'avec les
vraies polices.

Pour les installer :

1. Télécharger **Fraunces** et **Inter** sur [Google Fonts](https://fonts.google.com)
   (licence **OFL** — Open Font License, libre d'usage commercial).
2. Placer les fichiers dans `app/assets/fonts/` :
   `Fraunces-SemiBold.ttf`, `Inter-Regular.ttf`, `Inter-Medium.ttf`,
   `Inter-SemiBold.ttf`, `Inter-Bold.ttf`.
3. Déclarer les familles dans `app/pubspec.yaml` :

```yaml
flutter:
  fonts:
    - family: Fraunces
      fonts:
        - asset: assets/fonts/Fraunces-SemiBold.ttf
          weight: 600
    - family: Inter
      fonts:
        - asset: assets/fonts/Inter-Regular.ttf
          weight: 400
        - asset: assets/fonts/Inter-Medium.ttf
          weight: 500
        - asset: assets/fonts/Inter-SemiBold.ttf
          weight: 600
        - asset: assets/fonts/Inter-Bold.ttf
          weight: 700
```

Aucun changement de code n'est nécessaire : `EchappeeTypography` référence déjà
les familles `Fraunces` et `Inter` avec leurs fallbacks.

---

## 4. Espacement et Radius

### Espacement — grille 4 px

Source de vérité : `echappee_spacing.dart` (`EchappeeSpacing`). Tout espacement
est un multiple de 4 — jamais de valeur magique.

| Token | Valeur | Token | Valeur |
|---|---|---|---|
| `s4` | 4 | `s24` | 24 |
| `s8` | 8 | `s32` | 32 |
| `s12` | 12 | `s40` | 40 |
| `s16` | 16 | `s48` | 48 |
| `s20` | 20 | `s64` | 64 |

Tokens sémantiques :

| Token | Valeur | Usage |
|---|---|---|
| `screen` | 20 | Padding horizontal d'écran mobile |
| `card` | 16 | Padding interne des cards denses |
| `cardLoose` | 20 | Padding interne des cards aérées |
| `section` | 32 | Espace entre sections |
| `mapOverlay` | 16 | Padding des overlays denses sur carte |

### Radius — « arrondi, mais pas enfantin »

Source de vérité : `echappee_radius.dart` (`EchappeeRadius`). Les coins sont
généreux mais jamais bulbeux : un input reste un input, pas un bonbon.

| Token | Valeur | Usage |
|---|---|---|
| `sm` | 8 | Badges, petits tags |
| `md` | 12 | Inputs compacts, petites cards |
| `lg` | 18 | Boutons, chips de catégorie |
| `xl` | 24 | Cards flottantes, modales |
| `xxl` | 32 | Panneaux d'onboarding, hero cards |
| `full` | 999 | Pills, avatars |

Raccourcis `BorderRadius` constants : `smAll`, `mdAll`, `lgAll`, `xlAll`,
`xxlAll`, `fullAll`, et `xlTop` (haut arrondi des bottom sheets).

---

## 5. Ombres

Source de vérité : `echappee_shadows.dart` (`EchappeeShadows`).

Principe : **les cards flottent comme du papier au-dessus de la route**. Base
Deep Brown (`#2B211C`) à **8–12 % d'opacité**, blur 16–32, offset Y 4–12.
**Jamais d'ombre dure**, jamais de noir pur, jamais d'elevation Material par
défaut (toujours `elevation: 0` + `boxShadow` token).

| Token | Opacité | Blur | Offset Y | Usage |
|---|---|---|---|---|
| `sm` | Deep Brown 8 % | 16 | 4 | Chips, petites cards |
| `md` | Deep Brown 10 % | 24 | 8 | Cards flottantes (POI cards) |
| `lg` | Deep Brown 12 % | 32 | 12 | Bottom sheets, overlays carte |

`shadowBase` expose la couleur de base si une ombre custom est inévitable.

---

## 6. Composants

Tous les composants vivent dans `design_system/components/` et sont exportés
par `design_system.dart`. Le `ThemeData` du module s'obtient via
`EchappeeTheme.light()` (à appliquer en wrap `Theme` sur les écrans Échappée).

### 6.1 EchappeeButton

**Usage** : tout CTA du module. Trois variantes : `primary` (Clay Red, hauteur
54, l'action principale de l'écran — une seule par écran), `secondary` (Soft
White bordé, hauteur 52, action de second rang), `tertiary` (texte seul Clay
Red, action discrète). Gère `loading` (spinner) et `expanded` (pleine largeur
par défaut). Cible tactile >= 44 px garantie.

```dart
EchappeeButton(
  label: 'Créer mon échappée',
  onPressed: _createRoute,
)
```

### 6.2 EchappeeTextField

**Usage** : champ de saisie générique (recherche, profil, formulaires). Fond
Soft White, contour Warm Stone, focus Clay Red, label optionnel au-dessus.

```dart
EchappeeTextField(
  label: 'Ton prénom',
  hint: 'Comment veux-tu qu\'on t\'appelle ?',
  onChanged: _onNameChanged,
)
```

### 6.3 EchappeeRouteField

**Usage** : champ d'itinéraire signature (« Départ » / « Destination »).
Icône Clay Red à gauche, hint chaleureux. Peut être en lecture seule avec
`onTap` pour ouvrir un écran de recherche.

```dart
EchappeeRouteField(
  label: 'Destination',
  hint: 'Où vas-tu aujourd\'hui ?',
  readOnly: true,
  onTap: _openSearch,
)
```

### 6.4 EchappeeCategoryChip

**Usage** : filtres de catégorie (Producteurs, Marchés, Villages, Artisans…).
Pill Soft White au repos ; sélectionnée, elle prend la couleur de catégorie
(tokens `categoryXxx`). Transition douce 180 ms. Ne jamais transmettre
l'information par la couleur seule : l'icône et le libellé restent visibles.

```dart
EchappeeCategoryChip(
  label: 'Producteurs',
  icon: Icons.agriculture_outlined,
  color: EchappeeColors.categoryProducteurs,
  selected: _producteurs,
  onSelected: (v) => setState(() => _producteurs = v),
)
```

### 6.5 EchappeeDetourCard

**Usage** : composant signature — le choix du temps de détour (« Combien de
temps veux-tu t'offrir ? »). S'utilise avec `EchappeeDetourOption.presets`
(10 min / 25 min / 45 min / Surprends-moi). Sélection : fond `primaryTint`,
bord Clay Red.

```dart
EchappeeDetourCard(
  option: EchappeeDetourOption.presets[1], // '25 min — Je prends le temps'
  selected: _selected == 1,
  onTap: () => setState(() => _selected = 1),
)
```

### 6.6 EchappeeRouteOptionCard

**Usage** : comparaison d'itinéraires — trajet direct vs échappée recommandée.
La mini-ligne de route dessinée à gauche distingue les deux (pointillé taupe /
courbe Clay Red via `isEchappee`).

```dart
EchappeeRouteOptionCard(
  title: 'Échappée recommandée',
  duration: '2h32',
  distance: '194 km',
  subtitle: '4 haltes · +18 min',
  isEchappee: true,
  selected: true,
  onTap: _chooseEchappee,
)
```

### 6.7 EchappeePoiCard

**Usage** : une halte proposée le long de la route. Image (placeholder doux si
absente), nom, catégorie, statut « Ouvert / Fermé », coût du détour, raison de
la suggestion, badge partenaire si sponsorisé, actions favori + « Ajouter à ma
route ».

```dart
EchappeePoiCard(
  name: 'Ferme du Vieux Chêne',
  category: 'Producteurs',
  categoryColor: EchappeeColors.categoryProducteurs,
  isOpen: true,
  detourLabel: '+8 min de détour · 1,4 km de ta route',
  reason: 'Fromages fermiers, dégustation possible le matin.',
  isPartner: true,
  onAddToRoute: _addStop,
)
```

### 6.8 EchappeePartnerBadge

**Usage** : signaler **explicitement** tout contenu sponsorisé. Pill Soft Gold
20 %, libellé « Partenaire local » par défaut, sémantique « Contenu
sponsorisé » pour les lecteurs d'écran. À poser sur toute card ou fiche
sponsorisée — jamais caché, jamais ambigu.

```dart
const EchappeePartnerBadge()
```

### 6.9 EchappeeBottomSheet

**Usage** : panneau qui se pose doucement sur la carte (détails de halte,
options d'itinéraire). Haut arrondi `xlTop`, poignée de drag, ombre `lg`,
barrière `darkOverlay`. Le helper `show` gère le clavier.

```dart
EchappeeBottomSheet.show<void>(
  context,
  title: 'On a trouvé 4 haltes sur ta route.',
  child: const _HaltesList(),
);
```

### 6.10 EchappeeEmptyState

**Usage** : état vide — un moment calme, jamais un constat d'échec. Titre en
Fraunces (l'émotion), message doux, action secondaire optionnelle.

```dart
EchappeeEmptyState(
  title: 'Pas encore de belle halte ici.',
  message: 'Essaie d\'élargir ton détour ou de changer de catégorie.',
  actionLabel: 'Élargir le détour',
  onAction: _widenDetour,
)
```

### 6.11 EchappeeLoadingState

**Usage** : chargement signature — pas de spinner agressif. Une courbe de route
Clay Red se dessine et s'efface comme une respiration (cycle 1 400 ms), trois
haltes dorées éclosent en chemin.

```dart
const EchappeeLoadingState() // 'On cherche les plus beaux détours...'
```

---

## 7. Règles de copy

La voix de L'Échappée est **simple, calme, curieuse et chaude**. On tutoie, on
invite, on ne presse jamais. Pas de jargon GPS (« recalcul », « ETA »), pas
d'exclamation forcée.

Phrases clés (à réutiliser telles quelles) :

- « Où vas-tu aujourd'hui ? » — champ destination
- « Combien de temps veux-tu t'offrir ? » — choix du détour
- « 10 min — Une petite respiration »
- « 25 min — Je prends le temps »
- « 45 min — Je pars en échappée »
- « On a trouvé 4 haltes sur ta route. » — résultats
- CTA : « Créer mon échappée », « Ajouter à ma route »
- Label sponsorisé : « Partenaire local » — **toujours explicite**, jamais
  déguisé en recommandation organique.

Règles :

1. Une idée par phrase. Phrases courtes, verbe à l'impératif doux ou question.
2. Les durées sont des cadeaux (« t'offrir »), jamais des coûts.
3. Les états vides rassurent et proposent une suite — jamais « Aucun résultat ».
4. Les erreurs disent ce qui se passe et ce qu'on peut faire, sans culpabiliser.

---

## 8. Accessibilité

- **Contraste AA** minimum pour tout texte. `textPrimary` (#2B211C) sur
  `background`/`surface` passe largement ; `textSecondary` est réservé aux
  tailles >= 13 px ; ne jamais poser `accent` ou `border` comme couleur de
  texte porteur d'information.
- **Cibles tactiles >= 44 px** partout (garanti par les composants du DS :
  boutons, chips, cards, icônes d'action).
- **Corps de texte >= 15 px** (`body`) pour toute UI principale ; 13 px
  (`bodySmall`) uniquement pour les métadonnées.
- **Jamais d'information portée par la couleur seule** : « Ouvert / Fermé »
  est toujours écrit en toutes lettres, les catégories gardent icône + libellé,
  la sélection ajoute bordure + coche.
- **Sponsorisé explicite** : badge « Partenaire local » visible + sémantique
  « Contenu sponsorisé » pour les lecteurs d'écran (`EchappeePartnerBadge`).
- **Sémantique** : les cards interactives exposent `Semantics(button: true,
  selected: ...)` ; les animations décoratives sont en `ExcludeSemantics`.
- **Copy de permission localisation** (à utiliser telle quelle) :
  « L'Échappée utilise ta position pour trouver les haltes proches de ta
  route. Tu peux modifier ce choix à tout moment. »

---

## 9. Frontière Échappée vs RouteCore

Voir aussi [`docs/PRODUCT_SPLIT.md`](PRODUCT_SPLIT.md) pour la répartition
générale core / modules produits.

1. **Tout ce qui est décrit ici reste dans `product_modules/echappee/`.**
   Tokens, thème et composants ne sont importés que par les écrans du module
   Échappée — jamais par `core/`, `features/` ni par un autre module.
2. **Un composant ne migre vers `shared/` que s'il sert AUSSI à GPS
   Écoconduite.** Tant qu'un widget n'a qu'un seul consommateur produit, il
   reste dans le module. La migration vers le commun suit la règle
   PRODUCT_SPLIT : PR séparée, revue par l'autre dev.
3. **Le thème Échappée ne remplace JAMAIS le thème core neutre.**
   `EchappeeTheme.light()` s'applique en wrap `Theme(...)` à l'entrée des
   écrans du module ; le `ThemeData` global de RouteCore (`app/theme.dart`)
   reste neutre pour les écrans core et les autres produits.
4. Le design system est **autonome** : il ne dépend que de Flutter et des
   fichiers tokens voisins (imports relatifs). Aucune dépendance vers les
   features core, aucun package externe.

---

## 10. Motion

Le mouvement de L'Échappée est **calme** : tout glisse, rien ne saute.

| Type | Durée | Courbe | Exemples |
|---|---|---|---|
| Micro-interactions | 120–180 ms | `easeOut` | Chips, pressions, toggles |
| Cards | 200–280 ms | `easeOut` | Sélection DetourCard / RouteOptionCard |
| Sheets et overlays | 280–360 ms | `easeOutCubic` | Bottom sheets, modales |
| Tracé de route | 600–900 ms | `easeInOut` | Dessin de l'itinéraire sur la carte |

À éviter absolument :

- **Bounce agressif** (`elasticOut`, overshoot marqué) — rien ne rebondit.
- **Confetti** et célébrations bruyantes — une échappée réussie se conclut par
  une respiration, pas un feu d'artifice.
- **Parallaxe** et effets de profondeur exagérés — le papier flotte à plat.

Repères existants dans le code : `EchappeeCategoryChip` (180 ms, `easeOut`),
`EchappeeDetourCard` / `EchappeeRouteOptionCard` (200 ms, `easeOut`),
`EchappeeLoadingState` (cycle respirant 1 400 ms, `easeInOut`).
