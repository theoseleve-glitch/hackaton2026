#!/usr/bin/env python3
"""build_haltes.py — Carnet de haltes RÉELLES depuis OpenStreetMap (Overpass).

Couvre toute la France métropolitaine via une grille de tuiles, récupère les
points d'intérêt « terroir / halte » (producteurs, marchés, artisans, points
de vue, patrimoine, nature, bonnes tables régionales), ENRICHIT chaque entrée
(adresse, ville, téléphone, site, e-mail, horaires, description, labels bio/
accessibilité/cuisine), déduplique, et écrit app/assets/data/haltes.json.

Source des données : © les contributeurs OpenStreetMap — licence ODbL.
Reproductible et RÉSUMABLE (cache par tuile dans scripts/.haltes_cache/).

Usage:  python scripts/build_haltes.py            # complet
        python scripts/build_haltes.py --rows 7 --cols 7 --max 13000
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# France métropolitaine (bbox englobante).
LAT_MIN, LAT_MAX = 41.30, 51.20
LNG_MIN, LNG_MAX = -5.20, 9.70

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, ".haltes_cache")
OUT_PATH = os.path.join(SCRIPT_DIR, "..", "app", "assets", "data", "haltes.json")

# --- Filtre « France métropolitaine » (les bbox Overpass débordent sur les
# pays frontaliers : on garde uniquement les points DANS le territoire). On
# précalcule UN masque grille 0,1° (~8 km) depuis le polygone métropole, puis
# le test par point est O(1). Polygone : gregoiredavid/france-geojson (ODbL). ---
FRANCE_GEOJSON = os.path.join(SCRIPT_DIR, ".france_metropole.geojson")
FRANCE_GEOJSON_URL = ("https://raw.githubusercontent.com/gregoiredavid/"
                      "france-geojson/master/metropole.geojson")
_MASK_GRID = 0.1
_MASK = None  # (set_of_cells, min_lng, min_lat, grid)


def _france_polygons():
    if not os.path.exists(FRANCE_GEOJSON):
        req = urllib.request.Request(
            FRANCE_GEOJSON_URL, headers={"User-Agent": "lechappee-haltes/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, \
                open(FRANCE_GEOJSON, "wb") as fh:
            fh.write(r.read())
    g = json.load(open(FRANCE_GEOJSON, encoding="utf-8"))
    feat = g["features"][0] if g.get("type") == "FeatureCollection" else g
    geom = feat["geometry"]
    raw = (geom["coordinates"] if geom["type"] == "MultiPolygon"
           else [geom["coordinates"]])
    polys = []
    for poly in raw:
        outer = poly[0]
        xs = [p[0] for p in outer]
        ys = [p[1] for p in outer]
        polys.append((min(xs), min(ys), max(xs), max(ys), outer))
    return polys


def _point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and \
                (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _build_mask(log):
    polys = _france_polygons()
    minx = min(p[0] for p in polys)
    miny = min(p[1] for p in polys)
    maxx = max(p[2] for p in polys)
    maxy = max(p[3] for p in polys)
    g = _MASK_GRID
    nx = int((maxx - minx) / g) + 1
    ny = int((maxy - miny) / g) + 1
    mask = set()
    for ix in range(nx):
        x = minx + (ix + 0.5) * g
        for iy in range(ny):
            y = miny + (iy + 0.5) * g
            for (pminx, pminy, pmaxx, pmaxy, outer) in polys:
                if x < pminx or x > pmaxx or y < pminy or y > pmaxy:
                    continue
                if _point_in_ring(x, y, outer):
                    mask.add((ix, iy))
                    break
    log(f"   masque France: {len(mask)} cellules in-FR sur {nx}x{ny}")
    return (mask, minx, miny, g)


def in_france(lat, lng, log):
    global _MASK
    if _MASK is None:
        _MASK = _build_mask(log)
    mask, minx, miny, g = _MASK
    return (int((lng - minx) / g), int((lat - miny) / g)) in mask


def tile_query(s, w, n, e):
    b = f"{s:.4f},{w:.4f},{n:.4f},{e:.4f}"
    return f"""[out:json][timeout:170];
(
 node["shop"~"^(farm|dairy|cheese|greengrocer|honey|winery|wine|bakery|pastry|confectionery|chocolate|butcher|seafood|deli|spices|tea|coffee)$"]({b});
 node["amenity"="marketplace"]({b});
 node["craft"]({b});
 node["tourism"~"^(viewpoint|attraction|museum|artwork|gallery|picnic_site)$"]({b});
 node["natural"~"^(waterfall|peak|spring|cave_entrance|geyser|arch)$"]({b});
 node["historic"~"^(castle|monument|ruins|fort|monastery|memorial|archaeological_site|manor|city_gate|aqueduct|wayside_cross|tower)$"]({b});
 node["leisure"="garden"]({b});
 node["amenity"="restaurant"]["cuisine"~"regional|french|farm|local|crepe|savoyard|alsatian|basque"]({b});
 way["shop"~"^(farm|dairy|cheese|winery|wine)$"]({b});
 way["amenity"="marketplace"]({b});
 way["tourism"~"^(viewpoint|attraction|museum|gallery|picnic_site)$"]({b});
 way["historic"~"^(castle|monument|ruins|fort|monastery|archaeological_site|manor|aqueduct)$"]({b});
 way["leisure"="garden"]({b});
 way["natural"~"^(peak|waterfall)$"]({b});
);
out tags center;"""


def fetch(query, attempt_log):
    """POST la requête Overpass avec rotation de miroirs + backoff sur 429/504."""
    last_err = None
    for base in MIRRORS:
        for attempt in range(3):
            try:
                data = urllib.parse.urlencode({"data": query}).encode()
                req = urllib.request.Request(
                    base, data=data,
                    headers={"User-Agent": "lechappee-haltes/1.0 (ODbL build)"})
                with urllib.request.urlopen(req, timeout=185) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as ex:
                last_err = f"HTTP {ex.code} @ {base}"
                if ex.code in (429, 504, 503):
                    wait = 20 * (attempt + 1)
                    attempt_log(f"   {last_err} -> attente {wait}s")
                    time.sleep(wait)
                    continue
                break  # autre erreur -> miroir suivant
            except Exception as ex:  # noqa: BLE001 (réseau/parse)
                last_err = f"{type(ex).__name__} @ {base}"
                time.sleep(5)
    raise RuntimeError(last_err or "échec inconnu")


# --- Mapping OSM -> catégorie L'Échappée (8 slugs existants) ---
_FOOD_SHOP = {"farm", "dairy", "cheese", "greengrocer", "honey", "bakery",
              "pastry", "confectionery", "chocolate", "butcher", "seafood",
              "deli", "spices", "tea", "coffee"}
_WINE_SHOP = {"winery", "wine"}
_FOOD_CRAFT = {"winery", "brewery", "distillery", "bakery", "cheesemaker",
               "confectionery", "caterer", "honey", "beekeeper"}


def categorize(tags):
    shop = tags.get("shop")
    craft = tags.get("craft")
    amenity = tags.get("amenity")
    tourism = tags.get("tourism")
    natural = tags.get("natural")
    historic = tags.get("historic")
    leisure = tags.get("leisure")
    if amenity == "marketplace":
        return "market"
    if shop in _WINE_SHOP or craft == "winery":
        return "producer"
    if shop in _FOOD_SHOP:
        return "producer"
    if craft:
        return "producer" if craft in _FOOD_CRAFT else "artisan"
    if tourism == "viewpoint":
        return "viewpoint"
    if natural:
        return "viewpoint" if natural in ("peak", "arch") else "nature"
    if leisure == "garden" or tourism == "picnic_site":
        return "nature"
    if historic:
        return "village"
    if tourism in ("attraction", "museum", "artwork", "gallery"):
        return "village"
    if amenity == "restaurant":
        return "restaurant"
    return None


def build_address(tags):
    parts = []
    hn, street = tags.get("addr:housenumber"), tags.get("addr:street")
    if street:
        parts.append(f"{hn} {street}".strip() if hn else street)
    pc, city = tags.get("addr:postcode"), tags.get("addr:city")
    line2 = " ".join(p for p in (pc, city) if p)
    if line2:
        parts.append(line2)
    return ", ".join(parts) or None


def extract_tags(tags, slug):
    """Quelques attributs utiles -> liste de tags lisibles (qualité info)."""
    out = []
    if tags.get("organic") in ("yes", "only"):
        out.append("bio")
    if tags.get("wheelchair") == "yes":
        out.append("accessible")
    cuisine = tags.get("cuisine")
    if cuisine:
        out.append(f"cuisine:{cuisine.split(';')[0]}")
    for key in ("shop", "craft", "tourism", "historic", "natural"):
        v = tags.get(key)
        if v and v not in ("yes",):
            out.append(v.split(";")[0])
            break
    if any(k in tags for k in ("produce", "fruit", "vegetable")):
        out.append("produits-frais")
    if tags.get("vending") or tags.get("self_service") == "yes":
        out.append("automate")
    if "stars" in tags:
        out.append(f"{tags['stars']}★")
    return list(dict.fromkeys(out))[:5]  # dédup, max 5


def record(el):
    tags = el.get("tags") or {}
    name = (tags.get("name") or tags.get("brand") or "").strip()
    if not name or len(name) < 2:
        return None  # QUALITÉ : pas de halte anonyme
    slug = categorize(tags)
    if slug is None:
        return None
    if el["type"] == "node":
        lat, lng = el.get("lat"), el.get("lon")
    else:
        c = el.get("center") or {}
        lat, lng = c.get("lat"), c.get("lon")
    if lat is None or lng is None:
        return None
    rec = {
        "id": f"os{el['type'][0]}{el['id']}",
        "name": name,
        "cat": slug,
        "lat": round(lat, 6),
        "lng": round(lng, 6),
    }
    addr = build_address(tags)
    if addr:
        rec["addr"] = addr
    if tags.get("addr:city"):
        rec["city"] = tags["addr:city"]
    phone = tags.get("phone") or tags.get("contact:phone")
    if phone:
        rec["phone"] = phone.strip()
    web = tags.get("website") or tags.get("contact:website") or tags.get("url")
    if web:
        rec["web"] = web.strip()
    email = tags.get("email") or tags.get("contact:email")
    if email:
        rec["email"] = email.strip()
    if tags.get("opening_hours"):
        rec["hours"] = tags["opening_hours"]
    desc = tags.get("description") or tags.get("note")
    if desc:
        rec["desc"] = desc.strip()[:280]
    tg = extract_tags(tags, slug)
    if tg:
        rec["tags"] = tg
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=7)
    ap.add_argument("--cols", type=int, default=7)
    ap.add_argument("--max", type=int, default=14000)
    args = ap.parse_args()

    os.makedirs(CACHE_DIR, exist_ok=True)
    rows, cols = args.rows, args.cols
    dlat = (LAT_MAX - LAT_MIN) / rows
    dlng = (LNG_MAX - LNG_MIN) / cols
    total_tiles = rows * cols
    log = lambda m: print(m, flush=True)

    seen_ids = set()
    seen_spots = set()  # (slug, lat4, lng4) anti-doublon géographique
    haltes = []
    by_cat = {}

    idx = 0
    for r in range(rows):
        for c in range(cols):
            idx += 1
            s = LAT_MIN + r * dlat
            n = s + dlat
            w = LNG_MIN + c * dlng
            e = w + dlng
            cache_f = os.path.join(CACHE_DIR, f"tile_{r}_{c}.json")
            if os.path.exists(cache_f):
                with open(cache_f, encoding="utf-8") as fh:
                    elements = json.load(fh)
                log(f"[{idx}/{total_tiles}] tuile {r},{c} (cache) "
                    f"{len(elements)} éléments")
            else:
                log(f"[{idx}/{total_tiles}] tuile {r},{c} "
                    f"bbox=({s:.2f},{w:.2f},{n:.2f},{e:.2f}) ...")
                try:
                    j = fetch(tile_query(s, w, n, e), log)
                    elements = j.get("elements", [])
                    with open(cache_f, "w", encoding="utf-8") as fh:
                        json.dump(elements, fh)
                    log(f"   -> {len(elements)} éléments")
                    time.sleep(4)  # courtoisie Overpass public
                except Exception as ex:  # noqa: BLE001
                    log(f"   !! échec tuile {r},{c}: {ex} (on continue)")
                    continue
            for el in elements:
                rec = record(el)
                if rec is None:
                    continue
                if not in_france(rec["lat"], rec["lng"], log):
                    continue  # déborde sur un pays frontalier -> écarté
                if rec["id"] in seen_ids:
                    continue
                spot = (rec["cat"], round(rec["lat"], 4), round(rec["lng"], 4))
                if spot in seen_spots:
                    continue
                seen_ids.add(rec["id"])
                seen_spots.add(spot)
                haltes.append(rec)
                by_cat[rec["cat"]] = by_cat.get(rec["cat"], 0) + 1

    # Sélection ÉQUILIBRÉE par catégorie, PRIORITÉ aux fiches les plus riches
    # (qualité de l'info) : on garde d'abord celles avec adresse/horaires/
    # contact/description. Caps par catégorie pour une vraie diversité (sinon
    # une seule catégorie dominerait tout le carnet).
    def richness(h):
        return sum(1 for k in ("addr", "phone", "web", "email", "hours", "desc")
                   if h.get(k))

    caps = {"producer": 3200, "village": 2600, "viewpoint": 2400,
            "market": 1800, "nature": 1600, "artisan": 1400, "restaurant": 1000}
    grouped = {}
    for h in haltes:
        grouped.setdefault(h["cat"], []).append(h)
    selected = []
    for cat, items in grouped.items():
        items.sort(key=lambda h: (-richness(h), h["name"]))
        selected.extend(items[: caps.get(cat, 1500)])
    selected.sort(key=lambda h: (h["cat"], h["name"]))
    if len(selected) > args.max:
        selected = selected[: args.max]
    log(f"sélection: {len(selected)} retenues sur {len(haltes)} françaises")
    haltes = selected
    by_cat = {}
    for h in haltes:
        by_cat[h["cat"]] = by_cat.get(h["cat"], 0) + 1

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(haltes, fh, ensure_ascii=False, separators=(",", ":"))
    size_mb = os.path.getsize(OUT_PATH) / 1e6
    enriched = sum(1 for h in haltes if h.get("hours") or h.get("phone")
                   or h.get("web") or h.get("addr"))
    log("")
    log(f"=== {len(haltes)} haltes écrites -> {OUT_PATH} ({size_mb:.2f} Mo) ===")
    log(f"enrichies (adresse/horaires/contact): {enriched} "
        f"({100*enriched//max(1,len(haltes))}%)")
    log("par catégorie: " + ", ".join(
        f"{k}={v}" for k, v in sorted(by_cat.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    sys.exit(main())
