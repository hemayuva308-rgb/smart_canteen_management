import 'dotenv/config';

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

const jwtSecret = process.env.JWT_SECRET || (isTest ? 'test-secret-test-secret-test-secret-123' : '');
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set in server/.env and be at least 32 characters. See .env.example.');
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProd,
  isTest,
  PORT: Number(process.env.PORT || 5000),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tapandtake',
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CLIENT_ORIGINS: (process.env.CLIENT_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  // Demo payments: no real money moves. Disabled automatically in production unless explicitly enabled.
  ALLOW_DEMO_PAYMENTS: bool(process.env.ALLOW_DEMO_PAYMENTS, !isProd),
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  // Menu photos uploaded by staff are stored here and served publicly by the menu
  UPLOAD_DIR: process.env.UPLOAD_DIR || (isTest ? '/tmp/tapandtake-test-uploads' : './uploads'),
};

export const onlinePaymentsConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
