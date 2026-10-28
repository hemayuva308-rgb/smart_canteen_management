import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { unauthorized, forbidden, asyncHandler } from '../utils/errors.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

// Role is always re-read from the database, never trusted from the token alone.
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw unauthorized('Session expired. Please sign in again.');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw unauthorized('Account not available');
  req.user = user;
  next();
});

export const requireRole = (role) => [
  requireAuth,
  (req, _res, next) => (req.user.role === role ? next() : next(forbidden())),
];
export const requireAdmin = requireRole('ADMIN');
export const requireStudent = requireRole('STUDENT');
