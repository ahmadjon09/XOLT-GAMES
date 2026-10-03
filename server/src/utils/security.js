// JWT session helpers for Google/GitHub OAuth accounts.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// JWT yaratish - payloadga foydalanuvchi turi (kind) va roli qo'shiladi
export const signToken = (payload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

// JWT tekshirish
export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);
