import { Router } from 'express';
import express from 'express';
import { asyncHandler } from '../utils/errors.js';
import { handleWebhook } from '../services/paymentService.js';

const r = Router();
// Raw body is required to verify the provider signature.
r.post('/razorpay', express.raw({ type: '*/*', limit: '100kb' }), asyncHandler(async (req, res) => {
  res.json(await handleWebhook(req.body, req.headers['x-razorpay-signature']));
}));
export default r;
