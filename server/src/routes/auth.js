import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { validate } from '../middleware/common.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler, conflict, unauthorized, forbidden } from '../utils/errors.js';
import { env } from '../config/env.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.isTest ? 1000 : 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

const password = z.string().min(8, 'Use at least 8 characters').max(72).regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number');
const phone = z.string().trim().regex(/^\+?[0-9]{10,13}$/, 'Enter a valid phone number');

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(120),
  password,
  phone: phone.optional(),
  collegeId: z.string().trim().max(40).optional(),
}).strict(); // unknown keys such as "role" are rejected

r.post('/register', limiter, validate(registerSchema), asyncHandler(async (req, res) => {
  if (await User.exists({ email: req.body.email })) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const { password: _pw, ...profile } = req.body;
  const user = await User.create({ ...profile, passwordHash, role: 'STUDENT' });
  res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
}));

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) });
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

async function login(req, res, role) {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const ok = await bcrypt.compare(req.body.password, user?.passwordHash || DUMMY_HASH); // constant-ish time
  if (!user || !ok || !user.isActive) throw unauthorized('Incorrect email or password');
  if (user.role !== role) throw forbidden(role === 'ADMIN' ? 'This sign-in is for canteen staff only' : 'Staff accounts sign in on the admin dashboard');
  res.json({ token: signToken(user), user: user.toSafeJSON() });
}
r.post('/login', limiter, validate(loginSchema), asyncHandler((req, res) => login(req, res, 'STUDENT')));
r.post('/admin/login', limiter, validate(loginSchema), asyncHandler((req, res) => login(req, res, 'ADMIN')));

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toSafeJSON() }));

const profileSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), phone: phone.optional() }).strict();
r.patch('/me', requireAuth, validate(profileSchema), asyncHandler(async (req, res) => {
  Object.assign(req.user, req.body);
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
}));

const pwSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
r.post('/change-password', requireAuth, limiter, validate(pwSchema), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) throw unauthorized('Current password is incorrect');
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await user.save();
  res.json({ ok: true });
}));

export default r;
