export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const bad = (m, code) => new HttpError(400, m, code);
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m, 'UNAUTHENTICATED');
export const forbidden = (m = 'You do not have permission to do this') => new HttpError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found', code = 'NOT_FOUND') => new HttpError(404, m, code);
export const conflict = (m, code = 'CONFLICT') => new HttpError(409, m, code);
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
