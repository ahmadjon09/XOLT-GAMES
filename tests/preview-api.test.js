import test from 'node:test';
import assert from 'node:assert/strict';
import { db, mockApi } from '../preview/mock-api.mjs';

const player = { id: 'u1', kind: 'user' };
const admin = { id: 's_admin', kind: 'staff', role: 'ADMIN' };
const call = (method, path, { auth = player, query = '', body = {} } = {}) => mockApi({
  method,
  path,
  auth,
  query: new URLSearchParams(query),
  body,
});

test('preview search and public profiles omit private contact email', () => {
  const search = call('GET', '/user/players/search', { query: 'q=player2' });
  assert.equal(search.status, 200);
  assert.equal(search.data[0].username, 'player2');
  assert.equal(search.data[0].relation, 'friends');
  assert.equal('email' in search.data[0], false);

  const profile = call('GET', '/user/players/u2');
  assert.equal(profile.data.online, true);
  assert.equal(profile.data.activity.days.length, 28);
  assert.equal('email' in profile.data, false);

  const ownProfile = call('GET', '/user/profile');
  assert.equal(ownProfile.data.activity.days.length, 28);
  assert.ok('email' in ownProfile.data);
});

test('preview only allows admins to toggle games', () => {
  const game = db.gameCatalog.find((entry) => entry.id === 'typerace');
  const original = game.active;
  assert.equal(call('PATCH', '/staff/games/typerace', { body: { active: false } }).status, 403);
  const result = call('PATCH', '/staff/games/typerace', { auth: admin, body: { active: false } });
  assert.equal(result.data.active, false);
  game.active = original;
});

test('preview invites an online friend and expires the invite shortly', () => {
  const result = call('POST', '/user/friends/u2/invites', { body: { gameType: 'math' } });
  assert.equal(result.status, 200);
  assert.equal(result.data.status, 'pending');
  assert.ok(Date.parse(result.data.expiresAt) - Date.now() <= 120_000);
});

test('preview lets a signed-in player create a public quiz', () => {
  const result = call('POST', '/user/quizzes', {
    body: {
      name: 'Preview quiz',
      questions: [{ text: '2 + 2?', answer: '4', variants: ['3', '4'] }],
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.createdByUserId, player.id);
  assert.equal(result.data.questions.length, 1);
  db.quizzes = db.quizzes.filter((quiz) => quiz.id !== result.data.id);
});

test('preview code practice returns one question and rewards a correct answer', () => {
  const question = call('GET', '/user/code/practice', { query: 'category=js' });
  assert.equal(question.data.id, 'code_1');
  const user = db.users.find((entry) => entry.id === player.id);
  const oldCoin = user.coin;
  const result = call('POST', '/user/code/check', { body: { questionId: question.data.id, answer: '12' } });
  assert.equal(result.data.correct, true);
  assert.equal(user.coin, oldCoin + 3);
  user.coin = oldCoin;
});
