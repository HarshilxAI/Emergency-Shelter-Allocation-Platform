-- =====================================================================
-- Reference data: disaster types and facility catalogue
-- =====================================================================

INSERT INTO disaster_types (code, label, description) VALUES
  ('flood',      'Flood',      'Riverine, urban or flash flooding'),
  ('earthquake', 'Earthquake', 'Seismic event and structural collapse risk'),
  ('fire',       'Fire',       'Urban, industrial or wildfire event'),
  ('cyclone',    'Cyclone',    'Cyclonic storm with high wind and rain'),
  ('landslide',  'Landslide',  'Slope failure and debris flow'),
  ('other',      'Other',      'Any other emergency requiring shelter')
ON CONFLICT (code) DO NOTHING;

INSERT INTO facilities (code, label, description, is_critical) VALUES
  ('medical',       'Medical Assistance',       'On-site medical staff or first-aid post', TRUE),
  ('food',          'Food',                     'Prepared meals / community kitchen',       TRUE),
  ('water',         'Drinking Water',           'Safe drinking water supply',               TRUE),
  ('electricity',   'Electricity',              'Grid power or generator backup',           FALSE),
  ('toilets',       'Toilets',                  'Functional sanitation blocks',             TRUE),
  ('women_friendly','Women-Friendly Facilities','Separate, secured space for women',        FALSE),
  ('child_friendly','Child-Friendly Facilities','Safe area and provisions for children',    FALSE),
  ('accessibility', 'Accessibility Support',    'Ramps, ground-floor access, assistance',   FALSE),
  ('security',      'Security',                 'On-site security or police presence',      FALSE),
  ('pet_friendly',  'Pet Friendly',             'Accepts accompanying animals',             FALSE)
ON CONFLICT (code) DO NOTHING;
