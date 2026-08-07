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
        "Ta'lim platformasi uchun API. O'quvchilar, o'qituvchilar, kassirlar va adminlar uchun. Kirish: telefon raqam + parol (email ishlatilmaydi). Socket.IO o'yinlar: Math Game, Quiz Game (Kahoot uslubi), Tic-Tac-Toe - kod yoki QR orqali qo'shilish.",
    },
    servers: [{ url: '/', description: 'Joriy server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Login orqali olingan token: Authorization: Bearer <token>',
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
