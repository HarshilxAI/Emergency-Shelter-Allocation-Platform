-- =====================================================================
-- DEMONSTRATION DATA ONLY
-- =====================================================================
-- The shelters below are FICTIONAL records created for academic
-- demonstration of the allocation engine. They are geographically placed
-- around Bengaluru, Karnataka so the map and distance ranking behave
-- realistically, but they are NOT real emergency shelters and the contact
-- numbers are non-routable placeholders in the reserved 99999-xxxxx range.
-- Do not use this data in a real emergency.
-- =====================================================================

INSERT INTO shelters
  (name, description, address, city, state, pincode, latitude, longitude,
   total_capacity, current_occupancy, status, contact_name, contact_phone,
   emergency_phone, is_wheelchair_accessible, accessibility_notes, is_active)
VALUES
  ('Koramangala Community Relief Centre',
   'Demo record. Large indoor community hall with an attached playground, used as the primary relief centre for the south-east zone.',
   '4th Block, 80 Feet Road, Koramangala', 'Bengaluru', 'Karnataka', '560034',
   12.934500, 77.626300, 450, 120, 'available',
   'Relief Coordinator (Demo)', '99999-10001', '99999-10101', TRUE,
   'Step-free entry, two accessible washrooms, ground-floor dormitory.', TRUE),

  ('Indiranagar Municipal School Shelter',
   'Demo record. Four-storey school building converted for emergency housing, classrooms used as family units.',
   '100 Feet Road, HAL 2nd Stage, Indiranagar', 'Bengaluru', 'Karnataka', '560038',
   12.971800, 77.640700, 300, 265, 'limited',
   'School Warden (Demo)', '99999-10002', '99999-10102', FALSE,
   'Upper floors reachable only by stairs; ground floor reserved for elderly.', TRUE),

  ('Jayanagar Civic Assembly Hall',
   'Demo record. Central civic hall with a permanent community kitchen and generator backup.',
   '9th Block, Jayanagar East', 'Bengaluru', 'Karnataka', '560069',
   12.925100, 77.583200, 600, 180, 'available',
   'Civic Officer (Demo)', '99999-10003', '99999-10103', TRUE,
   'Ramped main entrance, accessible toilets on both floors.', TRUE),

  ('Whitefield Industrial Safety Shelter',
   'Demo record. Reinforced warehouse block maintained by the industrial area association.',
   'EPIP Zone, Whitefield', 'Bengaluru', 'Karnataka', '560066',
   12.969800, 77.749900, 500, 500, 'full',
   'Safety Officer (Demo)', '99999-10004', '99999-10104', TRUE,
   'Level floor throughout, wide doorways.', TRUE),

  ('Hebbal Lakeside Emergency Camp',
   'Demo record. Tented camp on elevated ground beside Hebbal lake. Closed for monsoon-season ground repair.',
   'Hebbal Ring Road, near Hebbal Lake', 'Bengaluru', 'Karnataka', '560024',
   13.035800, 77.591100, 250, 0, 'closed',
   'Camp Manager (Demo)', '99999-10005', '99999-10105', FALSE,
   'Unpaved ground; not suitable for wheelchairs when wet.', TRUE),

  ('Rajajinagar Sports Complex Shelter',
   'Demo record. Indoor stadium with large open floor area and permanent sanitation blocks.',
   'Dr. Rajkumar Road, Rajajinagar', 'Bengaluru', 'Karnataka', '560010',
   12.991200, 77.552400, 800, 210, 'available',
   'Complex Supervisor (Demo)', '99999-10006', '99999-10106', TRUE,
   'Fully accessible, lift to gallery level, accessible washrooms.', TRUE),

  ('Electronic City Tech Park Refuge',
   'Demo record. Converted office campus cafeteria and auditorium with full power backup.',
   'Phase 1, Electronic City', 'Bengaluru', 'Karnataka', '560100',
   12.845000, 77.660500, 400, 95, 'available',
   'Facilities Lead (Demo)', '99999-10007', '99999-10107', TRUE,
   'Lifts, ramps and accessible restrooms across the campus.', TRUE),

  ('Yelahanka Government High School Camp',
   'Demo record. School campus on high ground, frequently used during flood events in the north zone.',
   'Yelahanka New Town, Sector B', 'Bengaluru', 'Karnataka', '560064',
   13.100700, 77.596300, 350, 40, 'available',
   'Headmaster (Demo)', '99999-10008', '99999-10108', FALSE,
   'Ground floor accessible; first floor by stairs only.', TRUE),

  ('Basavanagudi Heritage Hall',
   'Demo record. Older masonry building, suitable for flood and fire events but not for seismic emergencies.',
   'Bull Temple Road, Basavanagudi', 'Bengaluru', 'Karnataka', '560004',
   12.941800, 77.573500, 180, 150, 'limited',
   'Trust Secretary (Demo)', '99999-10009', '99999-10109', FALSE,
   'Narrow doorways and a stepped entrance; limited accessibility.', TRUE),

  ('Marathahalli Outer Ring Road Shelter',
   'Demo record. Modern multipurpose hall beside the ORR with quick highway access.',
   'Marathahalli Bridge, Outer Ring Road', 'Bengaluru', 'Karnataka', '560037',
   12.956200, 77.701000, 320, 60, 'available',
   'Duty Officer (Demo)', '99999-10010', '99999-10110', TRUE,
   'Step-free access from the road-level entrance.', TRUE),

  ('Malleshwaram Ward Relief Point',
   'Demo record. Compact ward-level relief point intended for small family groups.',
   '15th Cross, Malleshwaram', 'Bengaluru', 'Karnataka', '560003',
   13.003500, 77.569800, 120, 102, 'limited',
   'Ward Officer (Demo)', '99999-10011', '99999-10111', TRUE,
   'Single-level building, ramped entry.', TRUE),

  ('Banashankari Temple Grounds Camp',
   'Demo record. Covered temple grounds with a large community kitchen operated by volunteers.',
   'Banashankari 2nd Stage', 'Bengaluru', 'Karnataka', '560070',
   12.915400, 77.573000, 420, 130, 'available',
   'Volunteer Lead (Demo)', '99999-10012', '99999-10112', FALSE,
   'Gravel courtyard; assistance available on request.', TRUE),

  ('KR Puram Railway Colony Shelter',
   'Demo record. Railway colony hall in the east zone, close to rail and road links.',
   'Railway Colony, Krishnarajapuram', 'Bengaluru', 'Karnataka', '560036',
   13.007800, 77.677400, 260, 30, 'available',
   'Colony Warden (Demo)', '99999-10013', '99999-10113', FALSE,
   'Stepped entrance; portable ramp available.', TRUE),

  ('Kengeri Satellite Town Shelter',
   'Demo record. Western-edge shelter with basic provisions, primarily a spill-over site.',
   'Kengeri Satellite Town', 'Bengaluru', 'Karnataka', '560060',
   12.907800, 77.482600, 200, 25, 'available',
   'Site Supervisor (Demo)', '99999-10014', '99999-10114', FALSE,
   'Single-storey structure; uneven approach path.', TRUE);

-- ---------------------------------------------------------------------
-- Facility assignments
-- ---------------------------------------------------------------------
INSERT INTO shelter_facilities (shelter_id, facility_code)
SELECT s.id, f.code
FROM shelters s
JOIN (VALUES
  ('Koramangala Community Relief Centre',  ARRAY['medical','food','water','electricity','toilets','women_friendly','child_friendly','accessibility','security']),
  ('Indiranagar Municipal School Shelter', ARRAY['food','water','toilets','child_friendly','electricity']),
  ('Jayanagar Civic Assembly Hall',        ARRAY['medical','food','water','electricity','toilets','women_friendly','accessibility','security']),
  ('Whitefield Industrial Safety Shelter', ARRAY['medical','food','water','electricity','toilets','security','accessibility']),
  ('Hebbal Lakeside Emergency Camp',       ARRAY['food','water','toilets']),
  ('Rajajinagar Sports Complex Shelter',   ARRAY['medical','food','water','electricity','toilets','women_friendly','child_friendly','accessibility','security','pet_friendly']),
  ('Electronic City Tech Park Refuge',     ARRAY['medical','food','water','electricity','toilets','women_friendly','accessibility','security']),
  ('Yelahanka Government High School Camp',ARRAY['food','water','toilets','child_friendly','women_friendly']),
  ('Basavanagudi Heritage Hall',           ARRAY['food','water','toilets','security']),
  ('Marathahalli Outer Ring Road Shelter', ARRAY['medical','food','water','electricity','toilets','accessibility','security']),
  ('Malleshwaram Ward Relief Point',       ARRAY['water','toilets','women_friendly','accessibility']),
  ('Banashankari Temple Grounds Camp',     ARRAY['food','water','toilets','child_friendly','women_friendly','pet_friendly']),
  ('KR Puram Railway Colony Shelter',      ARRAY['food','water','electricity','toilets','security']),
  ('Kengeri Satellite Town Shelter',       ARRAY['water','toilets','food'])
) AS m(shelter_name, codes) ON m.shelter_name = s.name
CROSS JOIN LATERAL unnest(m.codes) AS f(code)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Disaster suitability (0.00 – 1.00)
-- A missing row means the shelter is not rated for that disaster and the
-- engine applies its unrated-disaster penalty rather than excluding it.
-- ---------------------------------------------------------------------
INSERT INTO shelter_disaster_support (shelter_id, disaster_code, suitability_level)
SELECT s.id, d.code, d.level
FROM shelters s
JOIN (VALUES
  ('Koramangala Community Relief Centre',   'flood', 0.95), ('Koramangala Community Relief Centre','earthquake',0.80),
  ('Koramangala Community Relief Centre',   'fire',  0.90), ('Koramangala Community Relief Centre','cyclone',   0.85),
  ('Koramangala Community Relief Centre',   'other', 0.90),

  ('Indiranagar Municipal School Shelter',  'flood', 0.85), ('Indiranagar Municipal School Shelter','fire', 0.70),
  ('Indiranagar Municipal School Shelter',  'cyclone',0.75),('Indiranagar Municipal School Shelter','other',0.80),

  ('Jayanagar Civic Assembly Hall',         'flood', 0.90), ('Jayanagar Civic Assembly Hall','earthquake',0.85),
  ('Jayanagar Civic Assembly Hall',         'fire',  0.95), ('Jayanagar Civic Assembly Hall','cyclone',   0.90),
  ('Jayanagar Civic Assembly Hall',         'landslide',0.70),('Jayanagar Civic Assembly Hall','other',   0.90),

  ('Whitefield Industrial Safety Shelter',  'fire',  0.95), ('Whitefield Industrial Safety Shelter','earthquake',0.90),
  ('Whitefield Industrial Safety Shelter',  'flood', 0.60), ('Whitefield Industrial Safety Shelter','other',0.80),

  ('Hebbal Lakeside Emergency Camp',        'earthquake',0.90),('Hebbal Lakeside Emergency Camp','fire',0.85),
  ('Hebbal Lakeside Emergency Camp',        'other',0.60),

  ('Rajajinagar Sports Complex Shelter',    'flood', 0.95), ('Rajajinagar Sports Complex Shelter','earthquake',0.85),
  ('Rajajinagar Sports Complex Shelter',    'fire',  0.90), ('Rajajinagar Sports Complex Shelter','cyclone',0.95),
  ('Rajajinagar Sports Complex Shelter',    'landslide',0.80),('Rajajinagar Sports Complex Shelter','other',0.95),

  ('Electronic City Tech Park Refuge',      'flood', 0.90), ('Electronic City Tech Park Refuge','earthquake',0.85),
  ('Electronic City Tech Park Refuge',      'fire',  0.80), ('Electronic City Tech Park Refuge','cyclone',0.85),
  ('Electronic City Tech Park Refuge',      'other', 0.85),

  ('Yelahanka Government High School Camp', 'flood', 0.95), ('Yelahanka Government High School Camp','landslide',0.85),
  ('Yelahanka Government High School Camp', 'cyclone',0.75),('Yelahanka Government High School Camp','other',0.75),

  ('Basavanagudi Heritage Hall',            'flood', 0.80), ('Basavanagudi Heritage Hall','fire',0.75),
  ('Basavanagudi Heritage Hall',            'earthquake',0.25),('Basavanagudi Heritage Hall','other',0.65),

  ('Marathahalli Outer Ring Road Shelter',  'flood', 0.75), ('Marathahalli Outer Ring Road Shelter','fire',0.85),
  ('Marathahalli Outer Ring Road Shelter',  'earthquake',0.80),('Marathahalli Outer Ring Road Shelter','cyclone',0.80),
  ('Marathahalli Outer Ring Road Shelter',  'other', 0.80),

  ('Malleshwaram Ward Relief Point',        'flood', 0.85), ('Malleshwaram Ward Relief Point','fire',0.80),
  ('Malleshwaram Ward Relief Point',        'other', 0.75),

  ('Banashankari Temple Grounds Camp',      'flood', 0.80), ('Banashankari Temple Grounds Camp','cyclone',0.60),
  ('Banashankari Temple Grounds Camp',      'earthquake',0.85),('Banashankari Temple Grounds Camp','other',0.80),

  ('KR Puram Railway Colony Shelter',       'flood', 0.70), ('KR Puram Railway Colony Shelter','fire',0.80),
  ('KR Puram Railway Colony Shelter',       'landslide',0.75),('KR Puram Railway Colony Shelter','other',0.75),

  ('Kengeri Satellite Town Shelter',        'flood', 0.85), ('Kengeri Satellite Town Shelter','fire',0.70),
  ('Kengeri Satellite Town Shelter',        'other', 0.70)
) AS d(shelter_name, code, level) ON d.shelter_name = s.name
ON CONFLICT DO NOTHING;
