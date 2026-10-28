// Seeds menu and settings (idempotent). Add --demo to also create a demo student.
// Never run with --demo in production.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { User } from '../src/models/User.js';
import { getSettings } from '../src/models/Setting.js';

export const MENU = [
  ['Veg Thali', 'Dal, two sabzis, rice, 3 rotis and salad', 'Meals', 70, 'thali', true],
  ['Rajma Chawal', 'Slow-cooked rajma with steamed rice', 'Meals', 55, 'rice', true],
  ['Chole Bhature', 'Spiced chickpeas with two fluffy bhature', 'Meals', 60, 'curry', true],
  ['Paneer Wrap', 'Grilled paneer, onions and mint chutney in a roll', 'Snacks', 50, 'wrap', true],
  ['Veg Sandwich', 'Toasted, with cucumber, tomato and green chutney', 'Snacks', 35, 'sandwich', true],
  ['Samosa (2 pcs)', 'Crisp pastry with spiced potato filling', 'Snacks', 25, 'samosa', true],
  ['Masala Maggi', 'Noodles with veggies and a tadka', 'Snacks', 40, 'noodles', true],
  ['Egg Fried Rice', 'Wok-tossed rice with egg and spring onion', 'Meals', 65, 'rice', false],
  ['Masala Chai', 'Hot, strong, ginger-cardamom', 'Beverages', 12, 'cup', true],
  ['Cold Coffee', 'Chilled coffee with milk', 'Beverages', 40, 'glass', true],
  ['Fresh Lime Soda', 'Sweet or salted', 'Beverages', 25, 'glass', true],
  ['Gulab Jamun (2 pcs)', 'Warm, soaked in sugar syrup', 'Desserts', 30, 'dessert', true],
];

export async function seedBase() {
  for (const [name, description, category, price, img, isVeg] of MENU) {
    await MenuItem.updateOne({ name }, { $setOnInsert: { name, description, category, price, imageUrl: `/food/${img}.svg`, isVeg, isAvailable: true } }, { upsert: true });
  }
  await getSettings();
}

export async function seedDemoStudent() {
  const email = 'student@demo.tapandtake.local';
  if (await User.exists({ email })) return null;
  const password = 'Student@123'; // DEMO ONLY
  await User.create({ name: 'Demo Student', email, phone: '9876543210', passwordHash: await bcrypt.hash(password, 12), role: 'STUDENT' });
  return { email, password };
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const demo = process.argv.includes('--demo');
  if (demo && env.isProd) {
    console.error('Refusing to create demo accounts in production.');
    process.exit(1);
  }
  await connectDb();
  await seedBase();
  console.log('Seeded menu and default settings.');
  if (demo) {
    const s = await seedDemoStudent();
    console.log(s ? `Demo student: ${s.email} / ${s.password}  (demo only)` : 'Demo student already exists.');
  }
  if (!(await User.exists({ role: 'ADMIN' }))) console.log('No admin exists yet. Run: ADMIN_EMAIL=you@college.edu npm run create-admin');
  await disconnectDb();
}
