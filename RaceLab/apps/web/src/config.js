// config.js — single source of truth. Swap BRAND in one place.
// Copy is French (register "tu", to match the app). Structure/prices/hrefs unchanged.
export const BRAND = "RaceLab"; // public name (GripLab was a placeholder, dropped 2026-06-17)
export const LINKS = {
  trial: "https://racelab.app",
  account: "https://racelab.app",
};
export const NAV = [
  { label: "Comment ça marche", href: "#tune" },
  { label: "La boucle", href: "#loop" },
  { label: "Fonctions", href: "#features" },
  { label: "Tarifs", href: "#pricing" },
];
export const HERO = {
  eyebrow: "LE STRAVA DU RC",
  headline: ["RÉGLE MOINS.", "GAGNE PLUS."],
  headlineVariants: [["SOIS", "AU POINT."], ["ARRÊTE DE DEVINER", "TON RÉGLAGE."]],
  subhead: "Enregistre chaque session. Reçois un seul changement fondé de la part d'un ingénieur de course IA qui connaît ta piste, ta météo, et si son conseil a vraiment marché.",
  ctaPrimary: { label: "Essai gratuit", href: LINKS.trial },
  ctaSecondary: { label: "Voir comment ça marche", href: "#tune" },
};
export const PROBLEM = {
  eyebrow: "LE PROBLÈME",
  heading: "40 paramètres réglables. Une question :",
  big: "Je change quoi ?",
  body: "Carrossage, hauteur de caisse, huile d'amorto, différentiel, ressorts, aileron. La plupart des pilotes copient la fiche d'un rapide et croisent les doigts. Les conditions qui décident de tout — surface, grip, météo — n'arrivent jamais jusqu'au conseil.",
};
export const TUNE = {
  eyebrow: "RÈGLE EN DIRECT",
  heading: "Un changement à la fois.",
  caption: "De vraies valeurs de réglage. De vraies causes et effets. Comme travaille un vrai ingénieur de course — isole une variable, regarde ce qu'elle fait.",
  steps: [
    { part: "Hauteur de caisse", value: "-1,0 mm", note: "moins de roulis" },
    { part: "Carrossage", value: "-2,0°", note: "plus de grip en milieu de courbe" },
    { part: "Huile d'amorto", value: "+50 cSt arrière", note: "plus calme à la réaccélération" },
    { part: "Aileron", value: "+5°", note: "stable dans le rapide" },
  ],
  explode: "Chaque pièce. Rien de caché.",
};
export const ENGINEER = {
  eyebrow: "TON INGÉNIEUR DE COURSE IA",
  heading: "Strava te dit ce que tu as fait. RaceLab te dit quoi changer.",
  report: [
    { k: "Diagnostic", v: "La voiture sous-vire en milieu de courbe à l'accélération ; l'arrière est posé." },
    { k: "Changement principal", v: "Baisse la hauteur avant d'1 mm — libère la rotation à l'entrée." },
    { k: "Secondaire", v: "Si ça sous-vire encore, assouplis la barre avant de 0,2 mm." },
    { k: "N'y touche pas", v: "Le différentiel et les amortos arrière sont bons pour ces conditions." },
    { k: "Attendu", v: "Inscription plus vive, un peu plus de direction à l'accélération." },
    { k: "Conseil de pilotage", v: "Freine une longueur de voiture plus tôt à l'épingle ; laisse-la tourner." },
    { k: "Confiance", v: "Élevée — colle à la règle HUDY 4.2 pour le blue groove à fort grip." },
    { k: "Pourquoi", v: "Fondé sur tes 3 dernières sessions + la température et le grip d'aujourd'hui." },
  ],
  principles: [
    { t: "Un changement à la fois", d: "Jamais un paquet de cinq suppositions. Un seul geste classé et réversible." },
    { t: "Fondé ou silencieux", d: "Chaque changement cite une règle de la base de connaissances — ou on te dit de garder ce que tu as." },
    { t: "Sur l'appareil. Sans réseau", d: "Marche dans les stands sans Wi-Fi. Zéro API sur le chemin du conseil." },
  ],
  duel: { before: "18,40", after: "18,06", delta: "-0,34 s", label: "tour moyen, avant / après un seul changement" },
};
export const LOOP = {
  eyebrow: "LA BOUCLE",
  heading: "Chaque session rend la suivante plus rapide.",
  stations: [
    { n: "Course", d: "Tours au transpondeur + conditions captés automatiquement." },
    { n: "Journal", d: "Réglage attaché à la session, ressenti rapide, photos." },
    { n: "Ingénieur", d: "Un seul changement fondé à tester, avec le pourquoi." },
    { n: "Résultat", d: "Mieux / pareil / moins bien — l'IA t'apprend." },
    { n: "Partage", d: "Résultats vérifiés attachés ; les autres forkent." },
  ],
  punchline: "Chaque session enregistrée apprend à l'IA ce qui marche vraiment — un effet volant qu'un coffre à réglages figé ne copiera jamais.",
};
export const FEATURES = {
  eyebrow: "L'APP",
  heading: "Conçue pour la pit lane.",
  cards: [
    { t: "Garage", d: "Chaque voiture, chaque typologie — nitro ou électrique, la fiche s'adapte." },
    { t: "Fiches de réglages", d: "Versions immuables. Vois exactement ce qui a changé vs le kit." },
    { t: "Pistes", d: "Virage par virage, surfaces, conditions, records au tour." },
    { t: "Journal de sessions", d: "Enregistre une session en moins de 10 secondes, à la piste, hors ligne." },
    { t: "Comparer", d: "Deux sessions côte à côte : réglage vs conditions vs pneus." },
    { t: "Rapport d'ingénieur", d: "Le rapport en 8 parties, fondé sur ton historique." },
    { t: "Plan de course", d: "Fenêtres de stand au temps. Stand à 5:50, pas au tour 14." },
    { t: "Speedhive", d: "Les tours au transpondeur s'importent tout seuls. Nouvelle session détectée." },
  ],
};
export const PROOF = {
  eyebrow: "POURQUOI C'EST DIFFÉRENT",
  heading: "Le Strava du RC — mais prescriptif.",
  rows: [
    { a: "Activité (vélo/course à pied)", b: "Jour de course, créé tout seul depuis le chrono" },
    { a: "Trace GPS", b: "Temps au tour + la fiche de réglages attachée à la session" },
    { a: "Kudos", b: "Props — Au point · Envoie · Pas de bol" },
    { a: "Segments & classements", b: "Classements au tour par piste, par catégorie" },
    { a: "Rétro de l'année", b: "Le Bilan de saison" },
    { a: "— (aucun équivalent)", b: "Un ingénieur de course IA qui te dit quoi changer" },
  ],
  punchline: "Strava est descriptif. RaceLab est prescriptif.",
  facts: ["100 % du conseil sur l'appareil", "0 appel API sur le chemin du conseil", "Rapport d'ingénieur en 8 parties", "Résultats vérifiés au transpondeur"],
};
export const PRICING = {
  eyebrow: "TARIFS",
  heading: "Commence avec 15 jours gratuits.",
  plans: [
    { name: "Mensuel", price: "9,99 €", per: "/ mois", highlight: false },
    { name: "Annuel", price: "99,99 €", per: "/ an", highlight: true, badge: "2 mois offerts" },
  ],
  note: "Crée ton compte sur le web — c'est moins cher (pas de commission des stores).",
  cta: { label: "Démarre ton essai gratuit de 15 jours", href: LINKS.trial },
};
export const FINAL = {
  heading: "Sois au point.",
  sub: "Ta prochaine session pourrait être ta plus rapide.",
  cta: { label: "Démarre ton essai gratuit de 15 jours", href: LINKS.trial },
};
export const FOOTER = {
  tagline: "Sur l'appareil · fondé ou silencieux · fait par des pilotes.",
  links: [
    { label: "Comment ça marche", href: "#tune" },
    { label: "Tarifs", href: "#pricing" },
    { label: "racelab.app", href: LINKS.trial },
  ],
  legal: "Avant-lancement.",
};
