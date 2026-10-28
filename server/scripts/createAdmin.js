// Secure initial admin creation.
//   ADMIN_EMAIL=owner@college.edu ADMIN_PASSWORD='a-long-passphrase1' npm run create-admin
// If ADMIN_PASSWORD is not provided, a random one is generated and printed once.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';

export async function createAdmin({ email, password, name = 'Canteen Admin' }) {
  if (!email) throw new Error('ADMIN_EMAIL is required');
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url') + '9a';
    generated = true;
  }
  if (password.length < 10) throw new Error('Admin password must be at least 10 characters');
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new Error(`A user with ${email} already exists. Nothing was changed.`);
  await User.create({ name, email, passwordHash, role: 'ADMIN' });
  return { email, password: generated ? password : null };
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  await connectDb();
  try {
    const r = await createAdmin({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, name: process.env.ADMIN_NAME });
    console.log(`Admin created: ${r.email}`);
    if (r.password) console.log(`Generated password (shown once, change it after first login): ${r.password}`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}
