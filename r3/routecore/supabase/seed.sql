-- RouteCore — fictional seed data (dev only)

insert into poi_categories (id, name, slug, product_context, icon_name) values
  ('11111111-1111-1111-1111-111111111101', 'Producteur',        'producer',     'terroir', 'agriculture'),
  ('11111111-1111-1111-1111-111111111102', 'Marché',            'market',       'terroir', 'storefront'),
  ('11111111-1111-1111-1111-111111111103', 'Artisan',           'artisan',      'terroir', 'handyman'),
  ('11111111-1111-1111-1111-111111111104', 'Restaurant local',  'restaurant',   'terroir', 'restaurant'),
  ('11111111-1111-1111-1111-111111111105', 'Village',           'village',      'terroir', 'church'),
  ('11111111-1111-1111-1111-111111111106', 'Point de vue',      'viewpoint',    'terroir', 'landscape'),
  ('11111111-1111-1111-1111-111111111107', 'Événement',         'event',        'terroir', 'celebration'),
  ('11111111-1111-1111-1111-111111111108', 'Borne de recharge', 'ev-charger',   'ecodrive', 'ev_station'),
  ('11111111-1111-1111-1111-111111111109', 'Aire de covoiturage','carpool-area','ecodrive', 'groups'),
  ('11111111-1111-1111-1111-111111111110', 'Station-service',   'gas-station',  'common',  'local_gas_station');

-- POIs around the Lyon -> Valence axis (fictional businesses)
insert into pois (name, description, category_id, location, city, region, country, tags, source, is_verified, is_sponsored) values
  ('Ferme des Coteaux', 'Vente directe de fromages de chèvre fermiers.', '11111111-1111-1111-1111-111111111101', st_setsrid(st_makepoint(4.8200, 45.6200), 4326)::geography, 'Vienne', 'Auvergne-Rhône-Alpes', 'FR', '{fromage,bio}', 'seed', true, false),
  ('Marché de Condrieu', 'Marché de producteurs le dimanche matin.', '11111111-1111-1111-1111-111111111102', st_setsrid(st_makepoint(4.7670, 45.4630), 4326)::geography, 'Condrieu', 'Auvergne-Rhône-Alpes', 'FR', '{marché,dimanche}', 'seed', true, false),
  ('Atelier Poterie du Pilat', 'Céramiste, démonstrations et boutique.', '11111111-1111-1111-1111-111111111103', st_setsrid(st_makepoint(4.6500, 45.4000), 4326)::geography, 'Pélussin', 'Auvergne-Rhône-Alpes', 'FR', '{artisanat}', 'seed', true, false),
  ('Auberge de la Vallée', 'Cuisine du terroir, produits 100% locaux.', '11111111-1111-1111-1111-111111111104', st_setsrid(st_makepoint(4.8500, 45.2500), 4326)::geography, 'Saint-Vallier', 'Auvergne-Rhône-Alpes', 'FR', '{restaurant,terroir}', 'seed', true, true),
  ('Village de Malleval', 'Village médiéval perché classé.', '11111111-1111-1111-1111-111111111105', st_setsrid(st_makepoint(4.7290, 45.4090), 4326)::geography, 'Malleval', 'Auvergne-Rhône-Alpes', 'FR', '{patrimoine}', 'seed', true, false),
  ('Belvédère de Pierre-Aiguille', 'Vue panoramique sur les vignobles.', '11111111-1111-1111-1111-111111111106', st_setsrid(st_makepoint(4.8330, 45.0700), 4326)::geography, 'Crozes-Hermitage', 'Auvergne-Rhône-Alpes', 'FR', '{vue,vignoble}', 'seed', true, false),
  ('Fête de la Pogne', 'Fête gourmande annuelle (fictif).', '11111111-1111-1111-1111-111111111107', st_setsrid(st_makepoint(4.8920, 45.0440), 4326)::geography, 'Romans-sur-Isère', 'Auvergne-Rhône-Alpes', 'FR', '{événement}', 'seed', true, false),
  ('Borne Rapide A7 Sud', 'Recharge DC 150 kW (fictif).', '11111111-1111-1111-1111-111111111108', st_setsrid(st_makepoint(4.8900, 44.9300), 4326)::geography, 'Valence', 'Auvergne-Rhône-Alpes', 'FR', '{recharge}', 'seed', true, false),
  ('Aire de covoiturage Vienne Sud', 'Parking relais gratuit.', '11111111-1111-1111-1111-111111111109', st_setsrid(st_makepoint(4.8600, 45.5000), 4326)::geography, 'Vienne', 'Auvergne-Rhône-Alpes', 'FR', '{covoiturage}', 'seed', true, false),
  ('Station du Rhône', 'Carburants + GPL (fictif).', '11111111-1111-1111-1111-111111111110', st_setsrid(st_makepoint(4.8420, 45.3200), 4326)::geography, 'Chanas', 'Auvergne-Rhône-Alpes', 'FR', '{carburant}', 'seed', true, false);
