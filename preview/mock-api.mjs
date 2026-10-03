// OAuth-backed in-memory API for the optional local preview (no database required).
const dayMs = 86_400_000;
const stamp = (daysAgo = 0) => new Date(Date.now() - daysAgo * dayMs).toISOString();
let idSeq = 100;
const nextId = (prefix = 'p') => `${prefix}_${++idSeq}`;

const names = [
  'Ali Valiyev', 'Dilnoza Rahimova', 'Jasur Toshmatov', 'Madina Yusupova',
  'Bekzod Normatov', 'Shahnoza Alimova', 'Sardor Qodirov', 'Zilola Ergasheva',
  'Otabek Mahmudov', 'Nilufar Saidova', 'Rustam Joʻrayev', 'Kamola Xasanova',
  'Aziz Beknazarov', 'Sevara Tursunova', 'Doniyor Hakimov', 'Gulnoza Mirzayeva',
];

const frames = [
  { id: 'frame_starter', name: 'Starter', price: 0, rarity: 'common', image: null, active: true, sortOrder: 0 },
  { id: 'frame_sky', name: 'Sky', price: 150, rarity: 'uncommon', image: null, active: true, sortOrder: 1 },
  { id: 'frame_gold', name: 'Gold', price: 500, rarity: 'rare', image: null, active: true, sortOrder: 2 },
];
const effects = [
  { id: 'effect_starter', name: 'Starter', price: 0, rarity: 'common', type: 'name', config: null, active: true, sortOrder: 0 },
  { id: 'effect_glow', name: 'Glow', price: 250, rarity: 'uncommon', type: 'name', config: { animation: 'glow 1.6s ease-in-out infinite', color: '#7c3aed' }, active: true, sortOrder: 1 },
];
const gameCatalog = [
  ['math', 0], ['quiz', 1], ['tictactoe', 2], ['chess', 3], ['checkers', 4], ['typerace', 5], ['codebattle', 6],
].map(([id, sortOrder]) => ({ id, sortOrder, active: true, updatedAt: stamp() }));

export const db = {
  users: names.map((full_name, index) => ({
    id: `u${index + 1}`,
    full_name,
    username: `player${index + 1}`,
    email: `player${index + 1}@example.test`,
    avatar: null,
    coverImage: null,
    coin: 250 + index * 40,
    score: 1600 - index * 47,
    week_score: 280 - index * 9,
    month_score: 740 - index * 23,
    currentFrameId: 'frame_starter',
    currentEffectId: 'effect_starter',
    ownedFrameIds: ['frame_starter'],
    ownedEffectIds: ['effect_starter'],
    bestWpm: index === 0 ? 54 : Math.max(0, 48 - index * 2),
    createdAt: stamp(index * 3 + 1),
  })),
  staff: [{ id: 's_admin', full_name: 'XOLT Admin', email: 'admin@example.test', avatar: null, role: 'ADMIN', active: true, createdAt: stamp(200) }],
  friendRequests: [{ id: 'friend_u1_u2', requesterId: 'u1', recipientId: 'u2', status: 'ACCEPTED', createdAt: stamp(7) }],
  gameInvites: [],
  gameCatalog,
  frames,
  effects,
  quizzes: [{
    id: 'quiz_demo', name: 'Quick Math', keywords: ['math'], image: null,
    createdByUserId: 'u2', createdById: null, active: true, isPublic: true,
    createdAt: stamp(2), questions: [
      { id: 'question_1', text: '7 + 5 = ?', answer: '12', variants: ['11', '12', '13', '14'], image: null, timeLimit: 20, points: 1000, sortOrder: 0 },
      { id: 'question_2', text: '9 × 3 = ?', answer: '27', variants: ['21', '27', '29', '36'], image: null, timeLimit: 20, points: 1000, sortOrder: 1 },
    ],
  }],
  typingTexts: [
    { id: 'text_uz', title: 'Salom', lang: 'uz', content: "Salom dunyo! Bugun havo juda ham chiroyli, bolalar o'yin o'ynash uchun maydonga chiqdilar.", difficulty: 'easy', active: true, createdAt: stamp(2) },
    { id: 'text_en', title: 'Hello', lang: 'en', content: 'The quick brown fox jumps over the lazy dog while the sun shines brightly in the sky.', difficulty: 'easy', active: true, createdAt: stamp(1) },
    { id: 'text_ru', title: 'Привет', lang: 'ru', content: 'Привет мир! Сегодня отличная погода, и дети вышли во двор играть.', difficulty: 'normal', active: true, createdAt: stamp(3) },
  ],
  codeQuestions: [
    { id: 'code_1', title: 'console.log', category: 'js', code: 'console.log(1 + "2");', answer: '12', explanation: 'String concatenation', timeLimit: 20, points: 1000, coin: 10, active: true, createdAt: stamp(3) },
    { id: 'code_2', title: 'Python print', category: 'python', code: 'print(3 * 3)', answer: '9', explanation: 'Multiplication', timeLimit: 20, points: 1000, coin: 10, active: true, createdAt: stamp(2) },
  ],
  gameRecords: [],
};

export const findUser = (id) => db.users.find((user) => user.id === id) || null;
export const findStaff = (id) => db.staff.find((staff) => staff.id === id) || null;
export const findQuiz = (id) => db.quizzes.find((quiz) => quiz.id === id) || null;

const frameFor = (user) => frames.find((item) => item.id === user?.currentFrameId) || null;
const effectFor = (user) => effects.find((item) => item.id === user?.currentEffectId) || null;
const rankFor = (user) => [...db.users].sort((a, b) => b.score - a.score).findIndex((item) => item.id === user?.id) + 1;
const userView = (user) => user ? ({
  id: user.id,
  kind: 'user',
  full_name: user.full_name,
  avatar: user.avatar,
  coverImage: user.coverImage,
  email: user.email,
  username: user.username,
  coin: user.coin,
  score: user.score,
  week_score: user.week_score,
  month_score: user.month_score,
  currentFrame: frameFor(user),
  currentEffect: effectFor(user),
  ownedFrameIds: user.ownedFrameIds,
  ownedEffectIds: user.ownedEffectIds,
  createdAt: user.createdAt,
}) : null;
const friendView = (user) => user ? ({
  id: user.id,
  full_name: user.full_name,
  avatar: user.avatar,
  coverImage: user.coverImage,
  username: user.username,
  currentFrame: frameFor(user),
  currentEffect: effectFor(user),
}) : null;
const isOnline = (id) => id === 'u2';
const relationBetween = (a, b) => db.friendRequests.find((item) =>
  (item.requesterId === a && item.recipientId === b) || (item.requesterId === b && item.recipientId === a)) || null;
const canSee = (user, auth) => user && (!auth || user.id !== auth.id);
const publicPlayer = (user, viewerId) => {
  const relation = relationBetween(viewerId, user.id);
  const currentOnlineSeconds = isOnline(user.id) ? 3600 : 0;
  const days = Array.from({ length: 28 }, (_, offset) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (27 - offset));
    const key = date.toISOString().slice(0, 10);
    const seed = Number(user.id.replace(/\D/g, '') || 1) + offset;
    return { date: key, seconds: seed % 4 === 0 ? 0 : (seed % 5) * 600, sessions: seed % 3 === 0 ? 1 : 0 };
  });
  if (isOnline(user.id)) {
    const today = days.at(-1);
    today.seconds += currentOnlineSeconds;
  }
  return {
    id: user.id,
    full_name: user.full_name,
    username: user.username,
    avatar: user.avatar,
    coverImage: user.coverImage,
    currentFrame: frameFor(user),
    currentEffect: effectFor(user),
    score: user.score,
    week_score: user.week_score,
    month_score: user.month_score,
    rank: rankFor(user),
    friendsCount: db.friendRequests.filter((item) => item.status === 'ACCEPTED' && [item.requesterId, item.recipientId].includes(user.id)).length,
    relation: !viewerId || viewerId === user.id ? 'self' : relation?.status === 'ACCEPTED' ? 'friends' : relation ? relation.requesterId === viewerId ? 'outgoing' : 'incoming' : 'none',
    friendRequestId: relation?.id || null,
    online: isOnline(user.id),
    onlineSince: isOnline(user.id) ? new Date(Date.now() - currentOnlineSeconds * 1000).toISOString() : null,
    lastSeenAt: isOnline(user.id) ? null : stamp(1),
    currentOnlineSeconds,
    activity: { days, totalSeconds: days.reduce((sum, item) => sum + item.seconds, 0), onlineTodaySeconds: days.at(-1)?.seconds || 0 },
    createdAt: user.createdAt,
  };
};

const makeQuizQuestion = (question, index) => ({
  id: question.id || nextId('question'),
  text: question.text,
  answer: question.answer,
  variants: question.variants,
  image: question.image || null,
  timeLimit: question.timeLimit || 20,
  points: question.points || 1000,
  sortOrder: index,
});
const quizSummary = (quiz, auth) => ({
  id: quiz.id,
  name: quiz.name,
  keywords: quiz.keywords || [],
  image: quiz.image || null,
  active: quiz.active,
  isPublic: quiz.isPublic,
  isOwner: quiz.createdByUserId === auth.id,
  createdBy: (() => { const owner = findUser(quiz.createdByUserId); return owner ? { id: owner.id, full_name: owner.full_name, username: owner.username } : null; })(),
  questionsCount: quiz.questions.length,
  createdAt: quiz.createdAt,
});

export function mockApi({ method, path, query, body = {}, auth }) {
  const ok = (data, meta) => ({ status: 200, data, ...(meta ? { meta } : {}) });
  const error = (status, code, message) => ({ status, error: { code, message } });
  const p = path.replace(/^\/api/, '');
  const needUser = () => (!auth || auth.kind !== 'user' ? error(401, 'UNAUTHORIZED', 'Player sign-in required') : null);
  const needAdmin = () => (!auth || auth.kind !== 'staff' || auth.role !== 'ADMIN' ? error(403, 'AUTH_FORBIDDEN', 'Admin access required') : null);

  if (p === '/auth/me') {
    if (!auth) return error(401, 'UNAUTHORIZED', 'Sign in required');
    if (auth.kind === 'staff') {
      const staff = findStaff(auth.id);
      return staff ? ok({ id: staff.id, kind: 'staff', full_name: staff.full_name, email: staff.email, avatar: staff.avatar, role: 'ADMIN', createdAt: staff.createdAt }) : error(404, 'NOT_FOUND', 'Admin not found');
    }
    const user = findUser(auth.id);
    return user ? ok(userView(user)) : error(404, 'NOT_FOUND', 'Player not found');
  }
  if (p === '/auth/register' || p === '/auth/login') return error(410, 'OAUTH_REQUIRED', 'Use Google or GitHub OAuth');

  if (p === '/user/profile' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const user = findUser(auth.id);
    const profile = publicPlayer(user, auth.id);
    return ok({
      ...userView(user),
      online: profile.online,
      onlineSince: profile.onlineSince,
      lastSeenAt: profile.lastSeenAt,
      currentOnlineSeconds: profile.currentOnlineSeconds,
      activity: profile.activity,
    });
  }
  if (p === '/user/profile' && method === 'PATCH') {
    const bad = needUser(); if (bad) return bad;
    const user = findUser(auth.id);
    if (body.full_name) user.full_name = String(body.full_name).slice(0, 60);
    if (body.username) user.username = String(body.username).slice(0, 20);
    return ok({ full_name: user.full_name, username: user.username });
  }

  if (p === '/user/players/search' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const search = String(query.get('q') || '').replace(/^@/, '').trim().toLowerCase();
    if (search.length < 2) return ok([]);
    return ok(db.users.filter((user) => canSee(user, auth) && `${user.full_name} ${user.username} ${user.email}`.toLowerCase().includes(search))
      .slice(0, 20).map((user) => {
        const relation = relationBetween(auth.id, user.id);
        return { ...publicPlayer(user, auth.id), activity: undefined, relation: !relation ? 'none' : relation.status === 'ACCEPTED' ? 'friends' : relation.requesterId === auth.id ? 'outgoing' : 'incoming', requestId: relation?.id || null };
      }));
  }
  {
    const match = p.match(/^\/user\/players\/([^/]+)$/);
    if (match && method === 'GET') {
      const bad = needUser(); if (bad) return bad;
      const user = findUser(match[1]);
      return user ? ok(publicPlayer(user, auth.id)) : error(404, 'NOT_FOUND', 'Player not found');
    }
  }

  if (p === '/user/friends' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const relations = db.friendRequests.filter((item) => item.requesterId === auth.id || item.recipientId === auth.id);
    const accepted = relations.filter((item) => item.status === 'ACCEPTED').map((item) => findUser(item.requesterId === auth.id ? item.recipientId : item.requesterId));
    const incomingRequests = relations.filter((item) => item.status === 'PENDING' && item.recipientId === auth.id).map((item) => ({ id: item.id, user: friendView(findUser(item.requesterId)), createdAt: item.createdAt }));
    const outgoingRequests = relations.filter((item) => item.status === 'PENDING' && item.requesterId === auth.id).map((item) => ({ id: item.id, user: friendView(findUser(item.recipientId)), createdAt: item.createdAt }));
    return ok({
      friends: accepted.filter(Boolean).map((user) => ({ ...friendView(user), online: isOnline(user.id), onlineSince: isOnline(user.id) ? new Date(Date.now() - 3600_000).toISOString() : null, currentOnlineSeconds: isOnline(user.id) ? 3600 : 0 })),
      incomingRequests,
      outgoingRequests,
      incomingGameInvites: db.gameInvites.filter((invite) => invite.toUserId === auth.id && invite.status === 'pending').map((invite) => ({ ...invite, from: friendView(findUser(invite.fromUserId)) })),
    });
  }
  if (p === '/user/friends/requests' && method === 'POST') {
    const bad = needUser(); if (bad) return bad;
    const target = findUser(body.userId);
    if (!target || target.id === auth.id) return error(400, 'NOT_FOUND', 'Player not found');
    const existing = relationBetween(auth.id, target.id);
    if (existing) return error(409, 'FRIEND_REQUEST_EXISTS', 'A friend request already exists');
    const request = { id: nextId('friend'), requesterId: auth.id, recipientId: target.id, status: 'PENDING', createdAt: new Date().toISOString() };
    db.friendRequests.push(request);
    return ok({ id: request.id, user: friendView(target), createdAt: request.createdAt });
  }
  {
    const match = p.match(/^\/user\/friends\/requests\/([^/]+)\/respond$/);
    if (match && method === 'POST') {
      const bad = needUser(); if (bad) return bad;
      const request = db.friendRequests.find((item) => item.id === match[1] && item.recipientId === auth.id && item.status === 'PENDING');
      if (!request) return error(404, 'FRIEND_REQUEST_NOT_FOUND', 'Request not found');
      if (body.accept) request.status = 'ACCEPTED';
      else db.friendRequests = db.friendRequests.filter((item) => item.id !== request.id);
      return ok({ accepted: Boolean(body.accept) });
    }
    const inviteMatch = p.match(/^\/user\/friends\/invites\/([^/]+)\/respond$/);
    if (inviteMatch && method === 'POST') {
      const bad = needUser(); if (bad) return bad;
      const invite = db.gameInvites.find((item) => item.id === inviteMatch[1] && item.toUserId === auth.id && item.status === 'pending');
      if (!invite) return error(404, 'INVITE_NOT_FOUND', 'Invite not found');
      invite.status = body.accept ? 'accepted' : 'declined';
      return ok(invite);
    }
    const friendMatch = p.match(/^\/user\/friends\/([^/]+)$/);
    if (friendMatch && method === 'DELETE') {
      const relation = relationBetween(auth.id, friendMatch[1]);
      if (!relation || relation.status !== 'ACCEPTED') return error(404, 'NOT_FOUND', 'Friend not found');
      db.friendRequests = db.friendRequests.filter((item) => item.id !== relation.id);
      return ok({ removed: true });
    }
    const inviteSendMatch = p.match(/^\/user\/friends\/([^/]+)\/invites$/);
    if (inviteSendMatch && method === 'POST') {
      const bad = needUser(); if (bad) return bad;
      const friendId = inviteSendMatch[1];
      const relation = relationBetween(auth.id, friendId);
      if (!relation || relation.status !== 'ACCEPTED') return error(403, 'NOT_FRIENDS', 'Friends only');
      if (!isOnline(friendId)) return error(409, 'FRIEND_OFFLINE', 'Friend is offline');
      const invite = { id: nextId('invite'), fromUserId: auth.id, toUserId: friendId, gameType: body.gameType, status: 'pending', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString() };
      db.gameInvites.push(invite);
      return ok(invite);
    }
  }

  if (p === '/games/catalog' && method === 'GET') return ok(db.gameCatalog.filter((game) => game.active));
  if (p === '/games/lobby' && method === 'GET') return ok([]);
  if (p === '/user/quizzes' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const search = String(query.get('search') || '').toLowerCase();
    return ok(db.quizzes.filter((quiz) => (quiz.createdByUserId === auth.id || (quiz.isPublic && quiz.active)) && (!search || quiz.name.toLowerCase().includes(search))).map((quiz) => quizSummary(quiz, auth)));
  }
  if (p === '/user/quizzes' && method === 'POST') {
    const bad = needUser(); if (bad) return bad;
    const quiz = { id: nextId('quiz'), name: String(body.name || 'Untitled quiz'), keywords: body.keywords || [], image: body.image || null, createdByUserId: auth.id, createdById: null, active: true, isPublic: true, createdAt: new Date().toISOString(), questions: (body.questions || []).map(makeQuizQuestion) };
    db.quizzes.unshift(quiz);
    return ok(quiz, { message: 'Quiz created' });
  }
  {
    const match = p.match(/^\/user\/quizzes\/([^/]+)$/);
    if (match) {
      const bad = needUser(); if (bad) return bad;
      const index = db.quizzes.findIndex((quiz) => quiz.id === match[1] && quiz.createdByUserId === auth.id);
      if (method === 'GET') return index < 0 ? error(404, 'NOT_FOUND', 'Quiz not found') : ok(db.quizzes[index]);
      if (method === 'PATCH') {
        if (index < 0) return error(404, 'NOT_FOUND', 'Quiz not found');
        const quiz = db.quizzes[index];
        Object.assign(quiz, body);
        if (body.questions) quiz.questions = body.questions.map(makeQuizQuestion);
        return ok({ id: quiz.id, message: 'Quiz updated' });
      }
      if (method === 'DELETE') {
        if (index < 0) return error(404, 'NOT_FOUND', 'Quiz not found');
        db.quizzes.splice(index, 1);
        return ok({ id: match[1], message: 'Quiz deleted' });
      }
    }
  }

  if (p === '/user/leaderboard' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const period = query.get('period') || 'all';
    const page = Math.max(1, Number(query.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(query.get('limit') || 20)));
    const scoreKey = period === 'week' ? 'week_score' : period === 'month' ? 'month_score' : 'score';
    const sorted = [...db.users].sort((a, b) => b[scoreKey] - a[scoreKey]);
    const leaderboard = sorted.slice((page - 1) * limit, page * limit).map((user, index) => ({ ...userView(user), rank: (page - 1) * limit + index + 1 }));
    const current = sorted.findIndex((user) => user.id === auth.id);
    return ok({ leaderboard, pages: Math.ceil(sorted.length / limit), currentUser: current < 0 ? null : { ...userView(sorted[current]), rank: current + 1 } });
  }

  if (p === '/user/shop' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const user = findUser(auth.id);
    return ok({ coin: user.coin, frames: db.frames.filter((item) => item.active), effects: db.effects.filter((item) => item.active), ownedFrameIds: user.ownedFrameIds, ownedEffectIds: user.ownedEffectIds, currentFrame: frameFor(user), currentEffect: effectFor(user) });
  }
  if (p === '/user/shop/buy' && method === 'POST') {
    const bad = needUser(); if (bad) return bad;
    const user = findUser(auth.id);
    const item = body.type === 'frame' ? db.frames.find((entry) => entry.id === body.itemId) : db.effects.find((entry) => entry.id === body.itemId);
    if (!item) return error(404, 'NOT_FOUND', 'Item not found');
    if (user.coin < item.price) return error(400, 'INSUFFICIENT_COINS', 'Not enough coins');
    user.coin -= item.price;
    (body.type === 'frame' ? user.ownedFrameIds : user.ownedEffectIds).push(item.id);
    return ok({ coin: user.coin });
  }
  if (p === '/user/shop/equip' && method === 'POST') {
    const bad = needUser(); if (bad) return bad;
    const user = findUser(auth.id);
    if (body.type === 'frame') user.currentFrameId = body.itemId || null;
    else user.currentEffectId = body.itemId || null;
    return ok({ message: 'Equipped' });
  }
  if (p === '/user/typing/texts' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const lang = query.get('lang') || 'uz';
    const available = db.typingTexts.filter((text) => text.active && text.lang === lang);
    return ok(available[0] || db.typingTexts[0]);
  }
  if (p === '/user/typing/record' && method === 'POST') {
    const bad = needUser(); if (bad) return bad;
    const user = findUser(auth.id); user.bestWpm = Math.max(user.bestWpm || 0, Number(body.wpm) || 0);
    return ok({ id: nextId('typing'), wpm: Number(body.wpm) || 0, accuracy: Number(body.accuracy) || 0 });
  }
  if (p === '/user/typing/leaderboard' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const list = [...db.users].filter((user) => user.bestWpm > 0).sort((a, b) => b.bestWpm - a.bestWpm).slice(0, 20);
    const top = list.map((user) => ({ id: `typing_${user.id}`, wpm: user.bestWpm, accuracy: 96, duration: 30, mode: 'solo', createdAt: user.createdAt, user: { id: user.id, full_name: user.full_name, avatar: user.avatar, currentFrame: frameFor(user), currentEffect: effectFor(user) } }));
    const me = findUser(auth.id);
    const rank = list.findIndex((user) => user.id === auth.id);
    return ok({ top, my: me?.bestWpm ? { wpm: me.bestWpm, accuracy: 96, rank: rank >= 0 ? rank + 1 : null } : null });
  }
  if (p === '/user/code/categories' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    return ok([...new Set(db.codeQuestions.filter((item) => item.active).map((item) => item.category))].map((category) => ({ category, count: db.codeQuestions.filter((item) => item.active && item.category === category).length })));
  }
  if (p === '/user/code/practice' && method === 'GET') {
    const bad = needUser(); if (bad) return bad;
    const category = query.get('category') || 'js';
    const question = db.codeQuestions.find((item) => item.active && item.category === category);
    return question ? ok({ id: question.id, title: question.title, code: question.code, category: question.category, explanation: question.explanation, timeLimit: question.timeLimit, points: question.points }) : error(404, 'NO_QUESTIONS', 'No questions for this category');
  }
  if (p === '/user/code/check' && method === 'POST') {
    const bad = needUser(); if (bad) return bad;
    const question = db.codeQuestions.find((item) => item.id === body.questionId && item.active);
    if (!question) return error(404, 'NOT_FOUND', 'Question not found');
    const correct = String(body.answer || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(question.answer).replace(/\s+/g, ' ').trim().toLowerCase();
    const coin = correct ? 3 : 0;
    if (correct) findUser(auth.id).coin += coin;
    return ok({ correct, answer: question.answer, explanation: question.explanation, coin });
  }

  if (p === '/staff/profile' && method === 'GET') {
    const bad = needAdmin(); if (bad) return bad;
    return ok({ ...findStaff(auth.id), kind: 'staff' });
  }
  if (p === '/staff/profile' && method === 'PATCH') {
    const bad = needAdmin(); if (bad) return bad;
    const staff = findStaff(auth.id); staff.full_name = body.full_name || staff.full_name; return ok(staff);
  }
  if (p === '/staff/games' && method === 'GET') {
    const bad = needAdmin(); if (bad) return bad;
    return ok(db.gameCatalog);
  }
  {
    const match = p.match(/^\/staff\/games\/([^/]+)$/);
    if (match && method === 'PATCH') {
      const bad = needAdmin(); if (bad) return bad;
      const game = db.gameCatalog.find((item) => item.id === match[1]);
      if (!game) return error(404, 'NOT_FOUND', 'Game not found');
      game.active = Boolean(body.active); game.updatedAt = new Date().toISOString(); return ok(game);
    }
  }
  if (p === '/staff/users' && method === 'GET') {
    const bad = needAdmin(); if (bad) return bad;
    const search = String(query.get('search') || '').toLowerCase();
    const page = Math.max(1, Number(query.get('page') || 1)); const limit = Math.min(50, Math.max(1, Number(query.get('limit') || 20)));
    const users = db.users.filter((user) => `${user.full_name} ${user.username} ${user.email}`.toLowerCase().includes(search));
    return ok(users.slice((page - 1) * limit, page * limit).map((user) => ({ ...userView(user), rank: rankFor(user) })), { total: users.length, page, limit });
  }
  if (p === '/staff/users' && method === 'POST') return error(410, 'OAUTH_REQUIRED', 'Players join through OAuth');
  {
    const coins = p.match(/^\/staff\/users\/([^/]+)\/coins$/);
    if (coins) {
      const bad = needAdmin(); if (bad) return bad;
      const user = findUser(coins[1]); if (!user) return error(404, 'NOT_FOUND', 'Player not found');
      if (method === 'GET') return ok([], { coin: user.coin });
      if (method === 'POST') { user.coin += Number(body.amount) || 0; return ok({ coin: user.coin }); }
    }
    const match = p.match(/^\/staff\/users\/([^/]+)$/);
    if (match) {
      const bad = needAdmin(); if (bad) return bad;
      const user = findUser(match[1]); if (!user) return error(404, 'NOT_FOUND', 'Player not found');
      if (method === 'GET') return ok({ ...userView(user), rank: rankFor(user), games: db.gameRecords.filter((game) => game.winnerId === user.id).slice(-20) });
      if (method === 'PATCH') { Object.assign(user, body); return ok({ id: user.id }); }
      if (method === 'DELETE') { db.users = db.users.filter((item) => item.id !== user.id); return ok({ deleted: true }); }
    }
  }
  if (p === '/staff/stats/overview' && method === 'GET') {
    const bad = needAdmin(); if (bad) return bad;
    return ok({ usersCount: db.users.length, staffCount: db.staff.length, quizzesCount: db.quizzes.length, questionsCount: db.quizzes.reduce((sum, quiz) => sum + quiz.questions.length, 0), gamesCount: db.gameRecords.length, activeGamesCount: db.gameCatalog.filter((game) => game.active).length, activeToday: 4, coinsInCirculation: db.users.reduce((sum, user) => sum + user.coin, 0) });
  }
  if (p === '/staff/stats/charts' && method === 'GET') {
    const bad = needAdmin(); if (bad) return bad;
    const days = Math.min(90, Math.max(7, Number(query.get('days') || 30)));
    const registrations = []; const gamesByDay = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) { const date = stamp(offset).slice(0, 10); registrations.push({ date, count: Math.max(1, Math.round(4 + Math.sin(offset) * 2)) }); gamesByDay.push({ date, math: 2, quiz: 1, tictactoe: 1 }); }
    return ok({ registrations, gamesByDay, topUsers: [...db.users].sort((a, b) => b.score - a.score).slice(0, 10).map((user) => ({ id: user.id, full_name: user.full_name, score: user.score })), roleStaff: [{ role: 'ADMIN', count: db.staff.length }] });
  }
  if (p === '/staff/shop' && method === 'GET') {
    const bad = needAdmin(); if (bad) return bad;
    return ok({
      frames: db.frames.map((item) => ({ ...item, usersCount: db.users.filter((user) => user.ownedFrameIds.includes(item.id)).length })),
      effects: db.effects.map((item) => ({ ...item, usersCount: db.users.filter((user) => user.ownedEffectIds.includes(item.id)).length })),
    });
  }
  {
    const shopItem = p.match(/^\/staff\/shop\/(frames|effects)(?:\/([^/]+))?$/);
    if (shopItem) {
      const bad = needAdmin(); if (bad) return bad;
      const collection = shopItem[1] === 'frames' ? db.frames : db.effects;
      const id = shopItem[2];
      if (!id && method === 'POST') {
        const item = {
          ...body,
          id: body.id || nextId(shopItem[1] === 'frames' ? 'frame' : 'effect'),
          active: true,
          sortOrder: Number(body.sortOrder) || collection.length,
        };
        collection.push(item);
        return ok(item);
      }
      if (id) {
        const index = collection.findIndex((item) => item.id === id);
        if (index < 0) return error(404, 'NOT_FOUND', 'Shop item not found');
        if (method === 'PATCH') { Object.assign(collection[index], body); return ok(collection[index]); }
        if (method === 'DELETE') { collection.splice(index, 1); return ok({ deleted: true }); }
      }
    }
  }
  if (p === '/staff/typing-texts') {
    const bad = needAdmin(); if (bad) return bad;
    if (method === 'GET') {
      const lang = query.get('lang');
      return ok(db.typingTexts.filter((text) => !lang || text.lang === lang));
    }
    if (method === 'POST') {
      const text = { id: nextId('text'), ...body, active: true, createdAt: new Date().toISOString() };
      db.typingTexts.unshift(text);
      return ok(text);
    }
  }
  {
    const match = p.match(/^\/staff\/typing-texts\/([^/]+)$/);
    if (match) {
      const bad = needAdmin(); if (bad) return bad;
      const index = db.typingTexts.findIndex((text) => text.id === match[1]);
      if (index < 0) return error(404, 'NOT_FOUND', 'Typing text not found');
      if (method === 'PATCH') { Object.assign(db.typingTexts[index], body); return ok(db.typingTexts[index]); }
      if (method === 'DELETE') { db.typingTexts.splice(index, 1); return ok({ deleted: true }); }
    }
  }
  if (p === '/staff/code-questions') {
    const bad = needAdmin(); if (bad) return bad;
    if (method === 'GET') {
      const category = query.get('category');
      return ok(db.codeQuestions.filter((question) => !category || question.category === category));
    }
    if (method === 'POST') {
      const question = { id: nextId('code'), ...body, active: true, createdAt: new Date().toISOString() };
      db.codeQuestions.unshift(question);
      return ok(question);
    }
  }
  {
    const match = p.match(/^\/staff\/code-questions\/([^/]+)$/);
    if (match) {
      const bad = needAdmin(); if (bad) return bad;
      const index = db.codeQuestions.findIndex((question) => question.id === match[1]);
      if (index < 0) return error(404, 'NOT_FOUND', 'Code question not found');
      if (method === 'PATCH') { Object.assign(db.codeQuestions[index], body); return ok(db.codeQuestions[index]); }
      if (method === 'DELETE') { db.codeQuestions.splice(index, 1); return ok({ deleted: true }); }
    }
  }

  return null;
}
