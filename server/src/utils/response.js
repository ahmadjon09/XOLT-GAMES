// API javoblari va xatolar uchun yagona format

// Muvaffaqiyatli javob
export const ok = (res, data = null, meta = null) =>
  res.json(meta ? { success: true, data, meta } : { success: true, data });

// Xato javob
export const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, error: { code, message } });

// Business xato - try/catch ichida throw qilinadi
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Async route'larni try/catch bilan o'rab beruvchi helper
export const asyncH = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
