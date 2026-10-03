// Lightweight in-memory Prisma facade for the optional no-database preview.
import { db, findUser, findQuiz } from './mock-api.mjs';

const updateUser = async (id, data = {}) => {
  const user = findUser(id);
  if (!user) throw new Error(`preview: unknown user ${id}`);
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) user[key] = (user[key] || 0) + value.increment;
    else if (value && typeof value === 'object' && 'decrement' in value) user[key] = Math.max(0, (user[key] || 0) - value.decrement);
    else user[key] = value;
  }
  return { ...user };
};

export const prisma = {
  user: {
    findUnique: async ({ where: { id } }) => {
      const user = findUser(id);
      return user ? { ...user } : null;
    },
    findMany: async () => db.users.map((user) => ({ ...user })),
    update: ({ where: { id }, data }) => updateUser(id, data),
  },
  gameRecord: {
    create: async ({ data }) => {
      const record = { id: `record_${db.gameRecords.length + 1}`, ...data, createdAt: new Date() };
      db.gameRecords.push(record);
      return record;
    },
  },
  quiz: {
    findUnique: async ({ where: { id } }) => {
      const quiz = findQuiz(id);
      return quiz ? { ...quiz, questions: quiz.questions.map((question) => ({ ...question })) } : null;
    },
  },
  typingText: {
    findMany: async ({ where = {}, take = 30 } = {}) => db.typingTexts
      .filter((text) => !where.lang || text.lang === where.lang)
      .filter((text) => text.active !== false)
      .slice(0, take),
  },
  codeQuestion: {
    findMany: async ({ where = {}, take = 30 } = {}) => db.codeQuestions
      .filter((question) => !where.category || question.category === where.category)
      .filter((question) => question.active !== false)
      .slice(0, take),
  },
  $transaction: async (operations) => (typeof operations === 'function' ? operations(prisma) : Promise.all(operations)),
};
