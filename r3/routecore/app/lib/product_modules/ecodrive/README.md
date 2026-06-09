# Module GPS Écoconduite

Tout le code spécifique « sobriété » vit ici. Ne pas mettre de logique
EcoDrive dans core/shared/features.

- `domain/eco_driving_analyzer.dart` — analyse du track GPS (accélérations/
  freinages brusques, variance de vitesse, carburant/CO2) + score /100.
- `presentation/ecodrive_screens.dart` — `/ecodrive/compare` et
  `/ecodrive/dashboard`.

Voir `docs/PRODUCT_SPLIT.md` pour le contrat avec le core et la checklist MVP.
