'use strict';

/**
 * =====================================================================
 * CAPACITY ESTIMATION
 * =====================================================================
 * For public facilities with no officially published emergency capacity
 * (a school, community hall, sports complex, etc.), the system can
 * derive a working estimate from the building's floor area.
 *
 * Method: AREA_BASED, using the Sphere Handbook's minimum humanitarian
 * standard for covered emergency living space of 3.5 m² per person
 * (Sphere Association, "Minimum Standards in Shelter, Settlement and
 * Non-Food Items"). This is a widely cited floor for temporary mass
 * shelter — not a project-invented number — and is deliberately
 * conservative (it will under-, not over-, estimate a building's
 * capacity relative to more generous national norms).
 *
 * This is the ONLY estimation method implemented. It is pure and
 * synchronous: given the same floor area it always returns the same
 * capacity, so an admin can reproduce and audit the number by hand.
 *
 * An estimate is never treated as an official figure — every shelter
 * record carries a `capacity_type` of 'official' or 'estimated', and
 * the UI labels estimated capacities as such everywhere they appear.
 * =====================================================================
 */

/** m² per person, per the Sphere minimum standard for covered space. */
const SPHERE_SQM_PER_PERSON = 3.5;

const METHOD_AREA_BASED = 'AREA_BASED';

/**
 * @param {number} floorAreaSqm  usable floor area in square metres
 * @param {number} [areaPerPerson] override, m² per person (advanced use only)
 * @returns {{ estimatedCapacity: number, method: string, areaPerPerson: number, floorAreaSqm: number }}
 */
function estimateCapacityFromArea(floorAreaSqm, areaPerPerson = SPHERE_SQM_PER_PERSON) {
  const area = Number(floorAreaSqm);
  const perPerson = Number(areaPerPerson) || SPHERE_SQM_PER_PERSON;

  if (!Number.isFinite(area) || area <= 0) {
    throw new Error('floorAreaSqm must be a positive number');
  }
  if (perPerson <= 0) {
    throw new Error('areaPerPerson must be a positive number');
  }

  return {
    estimatedCapacity: Math.floor(area / perPerson),
    method: METHOD_AREA_BASED,
    areaPerPerson: perPerson,
    floorAreaSqm: area
  };
}

module.exports = {
  estimateCapacityFromArea,
  SPHERE_SQM_PER_PERSON,
  METHOD_AREA_BASED
};
