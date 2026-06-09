# Module Waze Terroir

Tout le code spécifique « découverte locale » vit ici. Ne pas mettre de
logique Terroir dans core/shared/features.

- `domain/terroir_relevance_scorer.dart` — classement des POI le long du
  trajet (pertinence, détour, boost sponsorisé borné à +0.1).
- `presentation/terroir_screens.dart` — `/terroir/plan` et `/terroir/results`.

Voir `docs/PRODUCT_SPLIT.md` pour le contrat avec le core et la checklist MVP.
