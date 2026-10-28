import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { runMigrations } from '../scripts/migrate.js';

await connectDb();
await runMigrations((r) => console.log('[migrate]', JSON.stringify(r)));
const app = createApp();
app.listen(env.PORT, () => console.log(`TAP & TAKE API listening on http://localhost:${env.PORT}`));
