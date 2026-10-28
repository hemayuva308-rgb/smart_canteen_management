import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, api, makeUser, placeOrder } from './helpers.js';
import { User } from '../src/models/User.js';

before(setup);
after(teardown);

test('register hashes the password and forces STUDENT role', async () => {
  const res = await api().post('/api/auth/register').send({ name: 'Asha K', email: 'Asha@Test.local', password: 'Secret123', phone: '9812345678' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'STUDENT');
  assert.equal(res.body.user.passwordHash, undefined);
  const stored = await User.findOne({ email: 'asha@test.local' }).select('+passwordHash');
  assert.notEqual(stored.passwordHash, 'Secret123');
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
});

test('register rejects role injection and weak passwords', async () => {
  const a = await api().post('/api/auth/register').send({ name: 'Eve X', email: 'eve@test.local', password: 'Secret123', role: 'ADMIN' });
  assert.equal(a.status, 400);
  const b = await api().post('/api/auth/register').send({ name: 'Eve X', email: 'eve2@test.local', password: 'short' });
  assert.equal(b.status, 400);
  assert.equal(await User.countDocuments({ role: 'ADMIN' }), 0);
});

test('duplicate email is rejected', async () => {
  const res = await api().post('/api/auth/register').send({ name: 'Asha K', email: 'asha@test.local', password: 'Secret123' });
  assert.equal(res.status, 409);
});

test('login works, wrong password fails with the same message as unknown user', async () => {
  const ok = await api().post('/api/auth/login').send({ email: 'asha@test.local', password: 'Secret123' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const bad = await api().post('/api/auth/login').send({ email: 'asha@test.local', password: 'wrong-pass1' });
  const ghost = await api().post('/api/auth/login').send({ email: 'nobody@test.local', password: 'wrong-pass1' });
  assert.equal(bad.status, 401);
  assert.equal(ghost.status, 401);
  assert.equal(bad.body.error, ghost.body.error);
});

test('protected routes need a valid token; forged tokens are refused', async () => {
  assert.equal((await api().get('/api/auth/me')).status, 401);
  assert.equal((await api().get('/api/orders')).status, 401);
  assert.equal((await api().get('/api/orders').set('Authorization', 'Bearer not.a.jwt')).status, 401);
});

test('students cannot use admin routes; staff cannot log in on the student endpoint', async () => {
  const student = await makeUser('STUDENT');
  const admin = await makeUser('ADMIN');
  assert.equal((await api().get('/api/admin/overview').set(student.auth)).status, 403);
  assert.equal((await api().get('/api/admin/overview').set(admin.auth)).status, 200);
  const r = await api().post('/api/auth/login').send({ email: admin.email, password: admin.password });
  assert.equal(r.status, 403);
  const r2 = await api().post('/api/auth/admin/login').send({ email: student.email, password: student.password });
  assert.equal(r2.status, 403);
});

test('a student cannot read another student order and sees no private data of others', async () => {
  const a = await makeUser('STUDENT');
  const b = await makeUser('STUDENT');
  const o = await placeOrder(a);
  assert.equal(o.status, 201);
  const peek = await api().get(`/api/orders/${o.body.order._id}`).set(b.auth);
  assert.equal(peek.status, 404);
  const list = await api().get('/api/orders').set(b.auth);
  assert.equal(list.body.orders.length, 0);
  const cancelOther = await api().post(`/api/orders/${o.body.order._id}/cancel`).set(b.auth);
  assert.equal(cancelOther.status, 404);
});

test('profile update cannot change role', async () => {
  const s = await makeUser('STUDENT');
  const r = await api().patch('/api/auth/me').set(s.auth).send({ role: 'ADMIN' });
  assert.equal(r.status, 400);
  const fresh = await User.findById(s.user._id);
  assert.equal(fresh.role, 'STUDENT');
});
