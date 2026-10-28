import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/student.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import { errorHandler, notFoundHandler } from './middleware/common.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.isProd ? 1 : false);
  app.use(helmet());
  app.use(cors({
    origin(origin, cb) {
      if (!origin || env.CLIENT_ORIGINS.includes(origin)) return cb(null, true); // non-browser tools send no Origin
      cb(new Error('Origin not allowed by CORS'));
    },
  }));
  app.use(rateLimit({ windowMs: 60 * 1000, limit: env.isTest ? 100000 : 300, standardHeaders: true, legacyHeaders: false }));

  app.use('/api/webhooks', webhookRoutes); // before express.json(): needs the raw body
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', studentRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
