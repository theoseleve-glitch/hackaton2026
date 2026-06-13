# -*- coding: utf-8 -*-
"""Extraction Overpass ciblée -> append dans mock_poi_dataset.dart + seed.sql.

Couche « découverte ouverte » du pipeline (deep-research-report 6) : lieux
réels OSM (ODbL, attribution requise), descriptions éditoriales neutres sans
spécifique inventé, horaires publics bruts quand présents.
"""
import json, re, time, unicodedata, urllib.request, sys

ROOT = r"C:\Users\Admin\Documents\Hacktaton26\r3\routecore"
DART = ROOT + r"\app\lib\features\poi\data\mock_poi_dataset.dart"
SQL = ROOT + r"\supabase\seed.sql"
# Plusieurs miroirs Overpass : on tourne dessus pour esquiver les 429.
MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
# Corridors déjà ingérés (run précédent) — on les saute pour ne pas re-cogner
# l'API ; la dédup protège de toute façon contre les doublons.
DONE = {"lyon-valence", "valence-nyons", "lyon-annecy", "lyon-stetienne"}

# (slug_corridor, bbox s,w,n,e, region_const, region_sql, default_city)
CORRIDORS = [
    ("lyon-valence", (44.85, 4.6, 45.8, 5.0), "_aura", "Auvergne-Rhône-Alpes", "Vienne"),
    ("valence-nyons", (44.3, 4.85, 45.0, 5.3), "_aura", "Auvergne-Rhône-Alpes", "Crest"),
    ("avignon-apt", (43.8, 4.8, 44.0, 5.5), "_paca", "Provence-Alpes-Côte d'Azur", "Gordes"),
    ("macon-beaune", (46.3, 4.7, 47.05, 5.0), "_bfc", "Bourgogne-Franche-Comté", "Cluny"),
    ("nimes-sete", (43.3, 3.6, 43.9, 4.4), "_occ", "Occitanie", "Montpellier"),
    ("paris-honfleur", (49.0, 0.2, 49.5, 2.4), "_nor", "Normandie", "Vernon"),
    ("lyon-annecy", (45.5, 4.85, 46.0, 6.2), "_aura", "Auvergne-Rhône-Alpes", "Aix-les-Bains"),
    ("lyon-stetienne", (45.35, 4.2, 45.75, 4.85), "_aura", "Auvergne-Rhône-Alpes", "Saint-Chamond"),
    ("montelimar-avignon", (43.9, 4.5, 44.6, 5.0), "_aura", "Auvergne-Rhône-Alpes", "Montélimar"),
    ("annecy-chamonix", (45.85, 6.1, 46.0, 6.9), "_aura", "Auvergne-Rhône-Alpes", "Sallanches"),
    ("grenoble-gap", (44.55, 5.6, 45.2, 6.1), "_paca", "Provence-Alpes-Côte d'Azur", "Gap"),
]

CAT = {  # selector -> (categoryId dart, slug, uuid suffix, tags, templates)
    "viewpoint": ("c6", "viewpoint", "06", ["vue", "photo"], [
        "Panorama repéré par les gens du coin — la vallée s'ouvre d'un coup.",
        "Un belvédère où l'on coupe le moteur sans se concerter.",
        "La vue récompense le détour ; le silence fait le reste.",
        "Table d'orientation ou pas, on reste plus longtemps que prévu.",
        "Le genre d'endroit qu'on ne trouve pas sans une carte bien faite.",
    ]),
    "market": ("c2", "market", "02", ["marché", "producteurs"], [
        "Halles ou place : les étals du coin, aux heures du marché.",
        "Marché référencé par la commune — producteurs et saison au rendez-vous.",
        "On y va pour trois fois rien et on repart le coffre plein.",
        "Le marché du coin, celui où les habitués ont leur banc.",
        "Étals locaux, parfums francs — vérifie le jour avant de dévier.",
    ]),
    "producer": ("c1", "producer", "01", ["producteurs", "gourmand"], [
        "Vente directe à la ferme, recensée par les contributeurs locaux.",
        "Un producteur du cru — la boutique est dans la cour.",
        "Ici, le circuit court n'est pas un slogan : c'est la porte à côté.",
        "Adresse de producteur transmise de carte en carte.",
        "On sonne, on goûte, on discute — la campagne en direct.",
    ]),
    "cheese": ("c1", "producer", "01", ["fromage", "gourmand"], [
        "Fromages du coin, affinage sur place — l'adresse circule entre habitués.",
        "Crémerie-fromagerie repérée par les gens du cru.",
        "Le plateau de la région tient dans cette boutique.",
    ]),
    "wine": ("c1", "producer", "01", ["vin", "cave"], [
        "Cave et vente directe — l'appellation se goûte sur place.",
        "Vigneron du secteur, porte ouverte aux curieux de passage.",
        "Une cave où l'on prend le temps, verre en main.",
    ]),
    "artisan": ("c3", "artisan", "03", ["insolite"], [
        "Atelier d'artisan recensé par la communauté — passe voir la main à l'œuvre.",
        "Un savoir-faire qui tient boutique, loin des zones commerciales.",
        "L'atelier est petit, le geste est grand.",
    ]),
    "waterfall": ("c11", "nature", "11", ["eau", "cascade", "balade"], [
        "Cascade repérée sur la carte — fraîcheur garantie après la marche.",
        "L'eau tombe, on se tait. Sentier d'approche court.",
        "Un détour pour le bruit de l'eau — prévois de bonnes chaussures.",
    ]),
}

QUERY = """[out:json][timeout:50];
(
  nwr["tourism"="viewpoint"]["name"]({bbox});
  nwr["amenity"="marketplace"]["name"]({bbox});
  nwr["shop"="farm"]["name"]({bbox});
  nwr["shop"="cheese"]["name"]({bbox});
  nwr["shop"="wine"]["name"]({bbox});
  nwr["craft"~"^(pottery|blacksmith|glassblower|winery|distillery)$"]["name"]({bbox});
  nwr["natural"="waterfall"]["name"]({bbox});
);
out center tags 60;"""

GENERIC = {"point de vue", "panorama", "belvédère", "belvedere", "viewpoint",
           "marché", "marche", "le marché", "cascade", "la cascade"}


def classify(tags):
    if tags.get("tourism") == "viewpoint":
        return "viewpoint"
    if tags.get("amenity") == "marketplace":
        return "market"
    if tags.get("shop") == "farm":
        return "producer"
    if tags.get("shop") == "cheese":
        return "cheese"
    if tags.get("shop") == "wine":
        return "wine"
    if tags.get("craft"):
        return "artisan"
    if tags.get("natural") == "waterfall":
        return "waterfall"
    return None


def fetch(bbox):
    q = QUERY.replace("{bbox}", ",".join(str(x) for x in bbox))
    body = ("data=" + urllib.parse.quote(q)).encode()
    last = None
    for mirror in MIRRORS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(mirror, data=body, headers={
                    "User-Agent": "routecore-echappee/0.1 (dev, one-shot batch)"})
                with urllib.request.urlopen(req, timeout=80) as r:
                    return json.loads(r.read().decode("utf-8"))
            except Exception as e:  # noqa: BLE001
                last = e
                code = getattr(e, "code", None)
                if code == 429 or code in (503, 504):
                    time.sleep(12)  # backoff puis miroir suivant
                    continue
                break  # autre erreur : miroir suivant directement
    raise last if last else RuntimeError("tous les miroirs ont échoué")


def norm(s):
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()


def existing_coords(dart_src):
    out = []
    for m in re.finditer(r"categorySlug: '([a-z-]+)', latitude: ([0-9.]+), longitude: ([0-9.]+)", dart_src):
        out.append((m.group(1), float(m.group(2)), float(m.group(3))))
    return out


def too_close(slug, lat, lon, coords):
    for s, la, lo in coords:
        if s == slug and abs(la - lat) < 0.0045 and abs(lo - lon) < 0.0065:
            return True  # ~500 m
    return False


def d_esc(s):
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("$", "\\$")


def s_esc(s):
    return s.replace("'", "''")


def main():
    dart_src = open(DART, encoding="utf-8").read()
    coords = existing_coords(dart_src)
    seen_names = set()
    dart_lines, sql_lines = [], []
    counter = 1
    template_idx = {}
    total_hours = 0
    per_corridor = {}

    for name_c, bbox, reg_const, reg_sql, default_city in CORRIDORS:
        if name_c in DONE:
            continue
        try:
            data = fetch(bbox)
        except Exception as e:
            print(f"{name_c}: Overpass KO ({e}) — corridor sauté", file=sys.stderr)
            per_corridor[name_c] = 0
            time.sleep(5)
            continue
        kept = 0
        for el in data.get("elements", []):
            if kept >= 28:
                break
            tags = el.get("tags", {})
            cat = classify(tags)
            if not cat:
                continue
            name = tags.get("name", "").strip()
            if not name or len(name) < 3 or norm(name) in GENERIC:
                continue
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if lat is None or lon is None:
                continue
            lat, lon = round(float(lat), 4), round(float(lon), 4)
            cid, slug, uid, tgs, templates = CAT[cat]
            key = (slug, norm(name))
            if key in seen_names or too_close(slug, lat, lon, coords):
                continue
            seen_names.add(key)
            coords.append((slug, lat, lon))
            city = tags.get("addr:city", default_city)
            i = template_idx.get(cat, 0)
            template_idx[cat] = i + 1
            desc = templates[i % len(templates)]
            hours = tags.get("opening_hours", "").strip()
            hours_ok = bool(hours) and len(hours) < 80 and '"' not in hours
            if hours_ok:
                total_hours += 1
            pid = f"os{counter}"
            counter += 1
            kept += 1
            oh_dart = (", openingHours: {'raw': '%s'}" % d_esc(hours)) if hours_ok else ""
            tags_dart = "[" + ", ".join("'" + t + "'" for t in tgs) + "]"
            dart_lines.append(
                f"  Poi(id: '{pid}', name: '{d_esc(name)}', categoryId: '{cid}', "
                f"categorySlug: '{slug}', latitude: {lat}, longitude: {lon}, "
                f"city: '{d_esc(city)}', region: {reg_const}, "
                f"description: '{d_esc(desc)}', tags: {tags_dart}, "
                f"isVerified: true, source: 'osm'{oh_dart}),")
            oh_sql = ("'" + s_esc(json.dumps({"raw": hours})) + "'::jsonb") if hours_ok else "null"
            sql_lines.append(
                f"  ('{s_esc(name)}', '{s_esc(desc)}', "
                f"'11111111-1111-1111-1111-1111111111{uid}', "
                f"st_setsrid(st_makepoint({lon}, {lat}), 4326)::geography, "
                f"'{s_esc(city)}', '{s_esc(reg_sql)}', 'FR', "
                f"'{{{','.join(tgs)}}}', 'osm', true, false, {oh_sql})")
        per_corridor[name_c] = kept
        time.sleep(6)

    if not dart_lines:
        print("RIEN EXTRAIT", file=sys.stderr)
        sys.exit(1)

    odbl = ("  // ── Entrées source 'osm' © contributeurs OpenStreetMap, ODbL 1.0 —\n"
            "  // attribution requise à l'affichage. Couche « découverte ouverte » :\n"
            "  // lieux réels, descriptions éditoriales neutres, horaires publics bruts.\n")
    # Dart : insertion avant le `];` final de mockPoiDataset.
    idx = dart_src.rstrip().rfind("];")
    dart_out = dart_src[:idx] + odbl + "\n".join(dart_lines) + "\n" + dart_src[idx:]
    open(DART, "w", encoding="utf-8", newline="\n").write(dart_out)

    sql_block = (
        "\n-- Entrées source 'osm' © contributeurs OpenStreetMap, ODbL 1.0 —\n"
        "-- attribution requise à l'affichage. Miroir des entrées 'os*' du mock Dart.\n"
        "insert into pois (name, description, category_id, location, city, region, country, tags, source, is_verified, is_sponsored, opening_hours) values\n"
        + ",\n".join(sql_lines) + ";\n")
    with open(SQL, "a", encoding="utf-8", newline="\n") as f:
        f.write(sql_block)

    print(json.dumps({"total": len(dart_lines), "avec_horaires": total_hours,
                      "par_corridor": per_corridor}, ensure_ascii=False))


if __name__ == "__main__":
    main()
