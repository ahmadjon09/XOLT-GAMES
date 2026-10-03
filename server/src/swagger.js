// Swagger API hujjatlari - /api-docs manzilida ko'rinadi
import { fileURLToPath } from 'url';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'XOLT Games API',
      version: '1.0.0',
      description:
        'Public multiplayer games API. Players sign in with Google or GitHub OAuth; admins manage public profiles, game availability, quizzes, shop content, and platform statistics. Live games use authenticated Socket.IO sessions.',
    },
    servers: [{ url: '/', description: 'Joriy server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'OAuth browser session cookie; API clients may also send Authorization: Bearer <JWT>.',
        },
      },
    },
  },
  apis: [fileURLToPath(new URL('./swagger.docs.js', import.meta.url))],
};

export function setupSwagger(app) {
  try {
    const spec = swaggerJSDoc(options);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'XOLT Games API' }));
    console.log('[swagger] hujjatlar tayyor: /api-docs');
  } catch (err) {
    console.error('[swagger] sozlashda xato:', err);
  }
}
