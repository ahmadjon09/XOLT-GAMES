import { MongoClient, ObjectId } from 'mongodb';

const PRESENCE_TTL_MS = 90_000;
const INVITE_TTL_MS = 2 * 60_000;
const ACTIVITY_DAYS = 28;

let client = null;
let db = null;
const memoryPresence = new Map();
const memoryInvites = new Map();
const memoryActivity = new Map();

const toMillis = (value) => value instanceof Date ? value.getTime() : Number(value || 0);
const isOnlineDoc = (doc, now = new Date()) =>
  Boolean(doc && Array.isArray(doc.sockets) && doc.sockets.length && toMillis(doc.expiresAt) > now.getTime());
const dateKey = (date) => date.toISOString().slice(0, 10);

export async function initMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[mongo] MONGODB_URI topilmadi; presence/activity/invites vaqtincha xotirada ishlaydi');
    return false;
  }

  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'xolt_games_runtime');
    // Presence keeps lastSeenAt after a user goes offline, so never TTL-delete it
    // using the short online lease. Remove the earlier lease TTL index if upgrading.
    await db.collection('presence').dropIndex('expiresAt_1').catch(() => {});
    await Promise.all([
      db.collection('presence').createIndex({ userId: 1 }, { unique: true }),
      db.collection('onlineActivity').createIndex({ userId: 1, date: 1 }, { unique: true }),
      db.collection('onlineActivity').createIndex({ userId: 1, date: -1 }),
      db.collection('onlineActivity').createIndex({ updatedAt: 1 }, { expireAfterSeconds: 35 * 24 * 60 * 60 }),
      db.collection('gameInvites').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('gameInvites').createIndex({ toUserId: 1, status: 1, createdAt: -1 }),
    ]);
    console.log(`[mongo] runtime data ulandi (${db.databaseName})`);
    return true;
  } catch (error) {
    const failedClient = client;
    db = null;
    client = null;
    await failedClient?.close().catch(() => {});
    console.warn('[mongo] ulanish muvaffaqiyatsiz; xotira rejimiga o‘tildi:', error?.message || error);
    return false;
  }
}

export async function closeMongo() {
  const current = client;
  client = null;
  db = null;
  if (current) await current.close().catch(() => {});
}

async function addOnlineDuration(userId, startedAt, endedAt) {
  const start = toMillis(startedAt);
  const end = toMillis(endedAt);
  if (end <= start) return;

  let cursor = start;
  let firstDay = true;
  while (cursor < end) {
    const segmentDate = new Date(cursor);
    const date = dateKey(segmentDate);
    const nextMidnight = Date.UTC(
      segmentDate.getUTCFullYear(),
      segmentDate.getUTCMonth(),
      segmentDate.getUTCDate() + 1,
    );
    const segmentEnd = Math.min(end, nextMidnight);
    const seconds = Math.max(0, Math.floor((segmentEnd - cursor) / 1000));
    if (seconds > 0) {
      if (db) {
        try {
          await db.collection('onlineActivity').updateOne(
            { userId, date },
            {
              $inc: { seconds, sessions: firstDay ? 1 : 0 },
              $set: { updatedAt: new Date(segmentEnd) },
            },
            { upsert: true },
          );
        } catch (error) {
          console.warn('[mongo] activity write failed; using process memory:', error?.message || error);
          addMemoryActivity(userId, date, seconds, firstDay ? 1 : 0);
        }
      } else {
        addMemoryActivity(userId, date, seconds, firstDay ? 1 : 0);
      }
      firstDay = false;
    }
    cursor = segmentEnd;
  }
}

function addMemoryActivity(userId, date, seconds, sessions) {
  const key = `${userId}:${date}`;
  const day = memoryActivity.get(key) || { userId, date, seconds: 0, sessions: 0 };
  day.seconds += seconds;
  day.sessions += sessions;
  memoryActivity.set(key, day);
}

export async function trackSocket(userId, socketId) {
  const now = new Date();
  if (db) {
    try {
      const collection = db.collection('presence');
      const previous = await collection.findOne({ userId }, { projection: { sockets: 1, expiresAt: 1 } });
      await collection.updateOne(
        { userId },
        [
          {
            $set: {
              __wasOnline: {
                $and: [
                  { $gt: ['$expiresAt', now] },
                  { $gt: [{ $size: { $ifNull: ['$sockets', []] } }, 0] },
                ],
              },
            },
          },
          {
            $set: {
              sockets: {
                $cond: [
                  '$__wasOnline',
                  { $setUnion: [{ $ifNull: ['$sockets', []] }, [socketId]] },
                  [socketId],
                ],
              },
              onlineSince: { $cond: ['$__wasOnline', { $ifNull: ['$onlineSince', now] }, now] },
              lastSeenAt: now,
              expiresAt: new Date(now.getTime() + PRESENCE_TTL_MS),
            },
          },
          { $unset: '__wasOnline' },
        ],
        { upsert: true },
      );
      return !isOnlineDoc(previous, now);
    } catch (error) {
      console.warn('[mongo] presence write failed; using process memory:', error?.message || error);
    }
  }

  const nowMs = now.getTime();
  const state = memoryPresence.get(userId) || { sockets: new Set(), lastSeenAt: 0, onlineSince: 0, expiresAt: 0 };
  const wasOnline = Boolean(state.sockets.size && state.expiresAt > nowMs);
  if (!wasOnline) {
    state.sockets.clear();
    state.onlineSince = nowMs;
  }
  state.sockets.add(socketId);
  state.lastSeenAt = nowMs;
  state.expiresAt = nowMs + PRESENCE_TTL_MS;
  memoryPresence.set(userId, state);
  return !wasOnline;
}

export async function refreshSocket(userId, socketId) {
  const now = new Date();
  if (db) {
    try {
      const result = await db.collection('presence').updateOne(
        { userId, sockets: socketId },
        { $set: { lastSeenAt: now, expiresAt: new Date(now.getTime() + PRESENCE_TTL_MS) } },
      );
      if (result.matchedCount > 0) return;
    } catch (error) {
      console.warn('[mongo] presence heartbeat failed:', error?.message || error);
    }
  }
  const state = memoryPresence.get(userId);
  if (!state?.sockets.has(socketId)) return;
  state.lastSeenAt = now.getTime();
  state.expiresAt = now.getTime() + PRESENCE_TTL_MS;
}

export async function untrackSocket(userId, socketId) {
  const now = new Date();
  if (db) {
    try {
      const collection = db.collection('presence');
      const pulled = await collection.findOneAndUpdate(
        { userId, sockets: socketId },
        { $pull: { sockets: socketId }, $set: { lastSeenAt: now } },
        { returnDocument: 'after' },
      );
      if (pulled?.sockets?.length) return false;
      if (pulled) {
        // Claim the transition to offline only if no new socket connected in the meantime.
        const closed = await collection.findOneAndUpdate(
          { userId, sockets: { $size: 0 }, expiresAt: { $gt: now } },
          { $set: { lastSeenAt: now, expiresAt: now }, $unset: { onlineSince: '' } },
          { returnDocument: 'before' },
        );
        if (!closed) return false;
        await addOnlineDuration(userId, closed.onlineSince, now);
        return true;
      }
    } catch (error) {
      console.warn('[mongo] presence removal failed; using process memory:', error?.message || error);
    }
  }

  const state = memoryPresence.get(userId);
  if (!state || !state.sockets.has(socketId)) return false;
  state.sockets.delete(socketId);
  state.lastSeenAt = now.getTime();
  if (state.sockets.size === 0) {
    const wasOnline = state.expiresAt > now.getTime();
    state.expiresAt = now.getTime();
    const startedAt = state.onlineSince;
    state.onlineSince = 0;
    if (wasOnline) await addOnlineDuration(userId, startedAt, now);
    return wasOnline;
  }
  return false;
}

function publicPresence(doc, now = new Date()) {
  const online = isOnlineDoc(doc, now);
  const onlineSince = online ? doc.onlineSince || null : null;
  return {
    online,
    onlineSince,
    lastSeenAt: doc?.lastSeenAt || null,
    currentOnlineSeconds: online && onlineSince
      ? Math.max(0, Math.floor((now.getTime() - toMillis(onlineSince)) / 1000))
      : 0,
  };
}

function memoryPresenceStatus(id, now) {
  const state = memoryPresence.get(id);
  const online = Boolean(state?.sockets?.size && state.expiresAt > now.getTime());
  const onlineSince = online && state.onlineSince ? new Date(state.onlineSince) : null;
  return {
    online,
    onlineSince,
    lastSeenAt: state?.lastSeenAt ? new Date(state.lastSeenAt) : null,
    currentOnlineSeconds: onlineSince ? Math.floor((now.getTime() - state.onlineSince) / 1000) : 0,
  };
}

export async function getPresenceStatuses(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  const now = new Date();
  if (!ids.length) return new Map();

  if (db) {
    try {
      const docs = await db.collection('presence').find(
        { userId: { $in: ids } },
        { projection: { userId: 1, sockets: 1, onlineSince: 1, lastSeenAt: 1, expiresAt: 1 } },
      ).toArray();
      const byId = new Map(docs.map((doc) => [doc.userId, publicPresence(doc, now)]));
      return new Map(ids.map((id) => [id, byId.get(id) || memoryPresenceStatus(id, now)]));
    } catch (error) {
      console.warn('[mongo] presence lookup failed; using process memory:', error?.message || error);
    }
  }

  return new Map(ids.map((id) => [id, memoryPresenceStatus(id, now)]));
}

export async function getPresenceStatus(userId) {
  const statuses = await getPresenceStatuses([userId]);
  return statuses.get(userId) || publicPresence(null);
}

export async function getOnlineIds(userIds) {
  const statuses = await getPresenceStatuses(userIds);
  return new Set([...statuses.entries()].filter(([, status]) => status.online).map(([id]) => id));
}

export async function getOnlineActivity(userId, days = ACTIVITY_DAYS) {
  const dayCount = Math.max(1, Math.min(90, Math.trunc(Number(days) || ACTIVITY_DAYS)));
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - dayCount + 1);
  const fromDate = dateKey(start);
  const status = await getPresenceStatus(userId);
  let rows = [];

  if (db) {
    try {
      rows = await db.collection('onlineActivity').find({ userId, date: { $gte: fromDate } })
        .sort({ date: 1 }).toArray();
    } catch (error) {
      console.warn('[mongo] activity lookup failed; using process memory:', error?.message || error);
    }
  }
  if (!rows.length) {
    rows = [...memoryActivity.values()].filter((row) => row.userId === userId && row.date >= fromDate);
  }

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const liveStart = status.online ? toMillis(status.onlineSince) : 0;
  const liveEnd = now.getTime();
  const activity = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const key = dateKey(date);
    const dayStart = date.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const liveOverlap = status.online
      ? Math.max(0, Math.floor((Math.min(liveEnd, dayEnd) - Math.max(liveStart, dayStart)) / 1000))
      : 0;
    const row = byDate.get(key);
    activity.push({
      date: key,
      seconds: Math.max(0, Number(row?.seconds || 0) + liveOverlap),
      sessions: Number(row?.sessions || 0),
    });
  }

  return {
    ...status,
    days: activity,
    totalSeconds: activity.reduce((sum, day) => sum + day.seconds, 0),
    onlineTodaySeconds: activity.at(-1)?.seconds || 0,
  };
}

function toPublicInvite(invite) {
  if (!invite) return null;
  return {
    id: String(invite._id),
    fromUserId: invite.fromUserId,
    toUserId: invite.toUserId,
    gameType: invite.gameType,
    status: invite.status,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}

export async function createGameInvite({ fromUserId, toUserId, gameType }) {
  const now = new Date();
  const invite = {
    _id: new ObjectId(),
    fromUserId,
    toUserId,
    gameType,
    status: 'pending',
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
  };
  if (db) {
    try {
      await db.collection('gameInvites').insertOne(invite);
      return toPublicInvite(invite);
    } catch (error) {
      console.warn('[mongo] invite write failed; using process memory:', error?.message || error);
    }
  }
  cleanupMemoryInvites(now.getTime());
  memoryInvites.set(String(invite._id), invite);
  return toPublicInvite(invite);
}

export async function getPendingGameInvites(userId) {
  const now = new Date();
  if (db) {
    try {
      const rows = await db.collection('gameInvites').find({
        toUserId: userId,
        status: 'pending',
        expiresAt: { $gt: now },
      }).sort({ createdAt: -1 }).limit(20).toArray();
      return rows.map(toPublicInvite);
    } catch (error) {
      console.warn('[mongo] invite lookup failed; using process memory:', error?.message || error);
    }
  }
  cleanupMemoryInvites(now.getTime());
  return [...memoryInvites.values()]
    .filter((invite) => invite.toUserId === userId && invite.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map(toPublicInvite);
}

export async function respondToGameInvite({ inviteId, userId, accept }) {
  if (!ObjectId.isValid(inviteId)) return null;
  const now = new Date();
  const status = accept ? 'accepted' : 'declined';
  if (db) {
    try {
      const result = await db.collection('gameInvites').findOneAndUpdate(
        { _id: new ObjectId(inviteId), toUserId: userId, status: 'pending', expiresAt: { $gt: now } },
        { $set: { status, respondedAt: now } },
        { returnDocument: 'after' },
      );
      return toPublicInvite(result);
    } catch (error) {
      console.warn('[mongo] invite response failed; using process memory:', error?.message || error);
    }
  }
  cleanupMemoryInvites(now.getTime());
  const invite = memoryInvites.get(inviteId);
  if (!invite || invite.toUserId !== userId || invite.status !== 'pending') return null;
  invite.status = status;
  invite.respondedAt = now;
  return toPublicInvite(invite);
}

function cleanupMemoryInvites(now) {
  for (const [id, invite] of memoryInvites) {
    if (invite.expiresAt.getTime() <= now) memoryInvites.delete(id);
  }
}
