import { prisma } from '../prisma/client.js';
import { cacheDel, cacheGet, cacheSet } from '../cache/index.js';

export const GAME_CATALOG_CACHE_KEY = 'xolt:game-catalog:v1';

export const DEFAULT_GAMES = [
  { id: 'math', sortOrder: 0 },
  { id: 'quiz', sortOrder: 1 },
  { id: 'tictactoe', sortOrder: 2 },
  { id: 'chess', sortOrder: 3 },
  { id: 'checkers', sortOrder: 4 },
  { id: 'typerace', sortOrder: 5 },
  { id: 'codebattle', sortOrder: 6 },
];

let ensurePromise;

async function ensureCatalogRows() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const existing = await prisma.gameCatalog.findMany({ select: { id: true } });
      const known = new Set(existing.map((row) => row.id));
      const missing = DEFAULT_GAMES.filter((game) => !known.has(game.id));
      if (missing.length) {
        await prisma.gameCatalog.createMany({
          data: missing.map((game) => ({ ...game, active: true })),
          skipDuplicates: true,
        });
      }
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

export async function getGameCatalog({ includeInactive = true, refresh = false } = {}) {
  if (!refresh) {
    const cached = await cacheGet(GAME_CATALOG_CACHE_KEY);
    if (cached) return includeInactive ? cached : cached.filter((game) => game.active);
  }

  try {
    await ensureCatalogRows();
    const catalog = await prisma.gameCatalog.findMany({ orderBy: { sortOrder: 'asc' } });
    await cacheSet(GAME_CATALOG_CACHE_KEY, catalog, 15);
    return includeInactive ? catalog : catalog.filter((game) => game.active);
  } catch (error) {
    // Existing game types remain available if the catalog table/database is not ready yet.
    console.warn('[games] catalog is temporarily unavailable:', error?.message || error);
    return DEFAULT_GAMES.map((game) => ({ ...game, active: true }));
  }
}

export async function isGameActive(gameId) {
  const catalog = await getGameCatalog();
  return catalog.find((game) => game.id === gameId)?.active ?? false;
}

export async function invalidateGameCatalog() {
  ensurePromise = null;
  await cacheDel(GAME_CATALOG_CACHE_KEY);
}
