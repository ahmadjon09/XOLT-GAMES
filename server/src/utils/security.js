// Parol va JWT bilan ishlash
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// Parolni hash qilish
export const hashPassword = (plain) => bcrypt.hash(plain, 10);

// Parolni tekshirish
export const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// JWT yaratish - payloadga foydalanuvchi turi (kind) va roli qo'shiladi
export const signToken = (payload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

// JWT tekshirish
export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);
