'use strict';

const asyncHandler = require('../utils/asyncHandler');
const recommendationService = require('../services/recommendation.service');

exports.create = asyncHandler(async (req, res) => {
  const request = await recommendationService.createRequestWithRecommendations(
    req.user.id,
    req.body
  );
  res.status(201).json({ success: true, data: { request } });
});

exports.listMine = asyncHandler(async (req, res) => {
  const { requests, total } = await recommendationService.listRequests({
    userId: req.user.id,
    ...req.query
  });
  res.json({ success: true, data: { requests, total } });
});

exports.getOne = asyncHandler(async (req, res) => {
  const request = await recommendationService.getRequestById(
    Number(req.params.id),
    req.user.id,
    req.user.role
  );
  res.json({ success: true, data: { request } });
});

exports.cancel = asyncHandler(async (req, res) => {
  const request = await recommendationService.cancelRequest(Number(req.params.id), req.user.id);
  res.json({ success: true, data: { request } });
});

/** Runs the engine without saving — used for "what would I get?" previews. */
exports.preview = asyncHandler(async (req, res) => {
  const result = await recommendationService.computeRecommendations(req.body);
  res.json({ success: true, data: result });
});
