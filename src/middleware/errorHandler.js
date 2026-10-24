import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  let statusCode = Number(err.statusCode || err.status) || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors;

  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body must be valid JSON';
    errors = undefined;
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
    errors = undefined;
  } else if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((item) => ({
      path: item.path,
      message: item.message,
    }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid value';
    errors = [{ path: err.path || '', message: 'Invalid value' }];
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'A record with this value already exists';
    errors = undefined;
  }

  if (statusCode >= 500) {
    console.error(err);
    if (env.nodeEnv === 'production') {
      message = 'Internal server error';
      errors = undefined;
    }
  }

  const body = { success: false, message };
  if (errors) {
    body.errors = errors;
  }
  res.status(statusCode).json(body);
}
