'use strict';

const asyncHandler = require('../utils/asyncHandler');
const shelterService = require('../services/shelter.service');
const { haversineKm } = require('../services/allocation.engine');

exports.list = asyncHandler(async (req, res) => {
  const { latitude, longitude, ...filters } = req.query;
  const { shelters, total } = await shelterService.listShelters(filters);

  // When the caller supplies a position, annotate each shelter with distance.
  const enriched =
    latitude !== undefined && longitude !== undefined
      ? shelters
          .map((s) => ({
            ...s,
            distanceKm:
              Math.round(haversineKm(latitude, longitude, s.latitude, s.longitude) * 1000) / 1000
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm)
      : shelters;

  res.json({ success: true, data: { shelters: enriched, total } });
});

exports.getOne = asyncHandler(async (req, res) => {
  const shelter = await shelterService.getShelterById(Number(req.params.id));
  const { latitude, longitude } = req.query;
  if (latitude !== undefined && longitude !== undefined) {
    shelter.distanceKm =
      Math.round(
        haversineKm(Number(latitude), Number(longitude), shelter.latitude, shelter.longitude) * 1000
      ) / 1000;
  }
  res.json({ success: true, data: { shelter } });
});

exports.referenceData = asyncHandler(async (req, res) => {
  const data = await shelterService.getReferenceData();
  res.json({ success: true, data });
});
