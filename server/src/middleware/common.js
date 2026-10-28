import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { HttpError } from '../utils/errors.js';

export const validate = (schema, where = 'body') => (req, _res, next) => {
  const r = schema.safeParse(req[where]);
  if (!r.success) return next(r.error);
  req[where] = r.data;
  next();
};

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Please check the highlighted fields',
      code: 'VALIDATION',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err?.name === 'MulterError') {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'That photo is too large. Take a smaller one.' : 'The photo upload was not valid.', code: tooBig ? 'PHOTO_TOO_LARGE' : 'PHOTO_INVALID' });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof mongoose.Error.ValidationError) return res.status(400).json({ error: err.message, code: 'VALIDATION' });
  if (err?.code === 11000) return res.status(409).json({ error: 'This record already exists', code: 'DUPLICATE' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}
