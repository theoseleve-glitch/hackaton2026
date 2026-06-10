# Module L'Échappée

**L'Échappée** est la marque du produit « découverte locale » (contexte
`terroir` en base/core). Tagline : *Le GPS des routes qui respirent.*

- `design_system/` — tokens (couleurs, typo, espacement, radius, ombres),
  thème et 11 composants réutilisables. Voir
  `docs/DESIGN_SYSTEM_ECHAPPEE.md` pour les règles d'usage.
- `presentation/design_system_preview_screen.dart` — vitrine de tous les
  composants, accessible sur la route `/echappee/design`.

Les flux produit (plan de détour, résultats POI) vivent encore dans
`product_modules/terroir/` ; ils migreront vers les composants Échappée
écran par écran. Ne rien déplacer vers `shared/` sauf si c'est aussi utile
à GPS Écoconduite (voir docs/PRODUCT_SPLIT.md).
