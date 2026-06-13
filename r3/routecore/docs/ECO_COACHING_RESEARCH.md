# Recherche — coaching d'écoconduite en temps réel (L'Échappée)

Synthèse (juin 2026) pour le coach LIVE : entrées disponibles = véhicule choisi
(conso mixte, carburant, prix), GPS (position/vitesse/altitude, 1-2 Hz),
accéléromètre + gyroscope (sensors_plus, ~10 Hz, téléphone non fixé).

## 1. Ce qui marche (littérature)

- **Le feedback temps réel bat le bilan a posteriori** : jusqu'à ~10 % de
  carburant économisé en guidage embarqué contre ~5 % en bilan post-trajet ;
  un essai contrôlé mesure 5,45 % (visuel-auditif temps réel) vs 3,43 %
  (feedback différé). L'écoconduite globale vaut 5-15 % selon trajet/véhicule.
- **Mais les deux se complètent** : le bilan de fin de trajet ancre le
  comportement dans la durée (rapport périodique > formation ponctuelle).
  → Notre duo : pastille sobre en conduite + écran « Bien arrivé·e » détaillé.
- **Surcharge cognitive = risque réel** : un HMI éco augmente la charge
  mentale s'il affiche trop ; bien conçu, il améliore les comportements sans
  surcharge. Règles retenues : **1 conseil à la fois**, message court,
  **délai minimum entre deux conseils (12 s)**, auto-effacement 8 s,
  l'**audio est préférable au visuel** quand le canal visuel est chargé
  (la carte de navigation l'est) — TTS en piste d'évolution.
- **L'anticipation est le levier n°1** : lever le pied tôt (regarder 12-15 s
  devant), laisser rouler en frein moteur jusqu'aux feux/ronds-points.
  Distance de lever de pied ≈ v²/(2·a) avec a ≈ 0,7 m/s² (décélération douce)
  — déjà le modèle d'EcoCoach.planAdvice.

## 2. Signaux extractibles de nos capteurs

- **Jerk / à-coups (accéléro)** : magnitude de l'accélération hors gravité
  (userAccelerometer), passée en filtre passe-bas (EMA), signée par la
  tendance de vitesse GPS. Détecte freinages/accélérations brusques entre
  deux fixes GPS.
- **Virages (gyro z)** : vitesse de lacet ; sert surtout de **fenêtre de
  validation** — |gyro| élevé = téléphone manipulé → échantillon rejeté.
- **Pente (altitude GPS lissée)** : EMA sur l'altitude, gradient % calculé
  sur des fenêtres de 100 m de distance parcourue (jamais point à point).
- **VSP (Vehicle Specific Power, Jiménez-Palacios, MIT 1999)** — proxy
  validé de la consommation instantanée (W/kg) :

  `VSP ≈ v · (1,1·a + 9,81·grade + 0,132) + 3,02e-4 · v³`

  (v en m/s, a en m/s², grade en fraction). La corrélation VSP ↔ conso est
  forte sur des pentes de −5 % à +5 %. Usage chez nous : le terme de pente
  `9,81·grade·v` corrige le score live (bonus en montée, malus en descente
  gourmande) — amplitude bornée à ±3 points.

## 3. Seuils recommandés

| Signal | Seuil | Source / note |
|---|---|---|
| Freinage brusque (GPS) | ≤ −8 km/h/s (≈ −2,2 m/s²) | seuil EcoCoach existant |
| Accélération brusque (GPS) | ≥ +6 km/h/s | idem |
| Freinage brusque (accéléro) | ≥ 3,0 m/s² (littérature : 2,5-5) | télématique smartphone |
| Accélération brusque (accéléro) | ≥ 2,5 m/s² | idem |
| Validation gyro | rejeter si \|ω\| > 1,5 rad/s | téléphone manipulé |
| Fenêtre de déclenchement conseil | 0-80 m avant le point | ~4 s à 70 km/h |
| Anti-spam conseils | 1 actif max, ≥ 12 s d'écart, affichage 8 s | charge cognitive |
| Fenêtre « anticipe » | ≥ 2 décélérations brusques sur 8 s glissantes | conseil générique |
| Pente | fenêtres de 100 m, gradient borné ±10 % | bruit altitude GPS |

## 4. Limites honnêtes

- **Altitude GPS de smartphone : précision de plusieurs mètres** ; même
  filtrée, la pente est indicative → impact volontairement faible (±3 pts de
  score), jamais un conseil direct « pente ».
- **Téléphone non fixé** : l'accéléro mélange mouvements du véhicule et
  manipulations ; les seuils fixes ne sont pas universels (position du
  téléphone, état de la route). Parades : magnitude (insensible à
  l'orientation), validation par gyro, et **mode dégradé GPS-seul** complet
  (émulateur sans capteurs inclus).
- **Pas d'OBD** : la conso est estimée (modèle EcoCoach calé ADEME), jamais
  présentée comme mesurée.

## Sources

- Revue feedback éco (PMC) : <https://pmc.ncbi.nlm.nih.gov/articles/PMC8512309/>
- HMI éco & charge mentale : <https://pubmed.ncbi.nlm.nih.gov/32919220/> ;
  <https://www.sciencedirect.com/science/article/abs/pii/S0965856418300041>
- Essai numérique vs symbolique : <https://www.sciencedirect.com/science/article/abs/pii/S1361920918302359>
- VSP : <https://en.wikipedia.org/wiki/Vehicle-specific_power> ;
  <https://rdrr.io/rforge/pems/man/2.3.1.vsp.calculations.html>
- Freinage brusque smartphone (Google) : <https://arxiv.org/pdf/2202.01934>
- Télématique smartphone (10 ans) : <https://arxiv.org/pdf/1611.03618>
- Pente par smartphone : <https://zhuozhaoli.github.io/assets/pdf/ICDCS-kang-gradient-2019.pdf>
- Pente & conso diesel : <https://www.mdpi.com/2073-4433/16/2/143>
