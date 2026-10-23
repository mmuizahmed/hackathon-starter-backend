import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  let statusCode = Number(err.statusCode || err.status) || 500;
  let message = err.message || 'Internal server error';

  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body must be valid JSON';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
  } else if (statusCode >= 500 && env.nodeEnv === 'production') {
    message = 'Internal server error';
  }

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
}
