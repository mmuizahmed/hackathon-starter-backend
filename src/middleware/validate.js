import { AppError } from '../utils/AppError.js';

function zodErrors(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function check(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    return { ok: false, errors: zodErrors(result.error) };
  }
  return { ok: true, data: result.data };
}

export function validateBody(schema) {
  return (req, res, next) => {
    const result = check(schema, req.body ?? {});
    if (!result.ok) {
      next(new AppError('Validation failed', 400, result.errors));
      return;
    }
    req.validated = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = check(schema, req.query ?? {});
    if (!result.ok) {
      next(new AppError('Validation failed', 400, result.errors));
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Route params never reach Mongo as a cast. A bad id is the same 400 as a bad body field.
export function rejectBadObjectId(req, res, next, value, name) {
  if (OBJECT_ID.test(String(value || ''))) {
    next();
    return;
  }
  next(new AppError('Validation failed', 400, [{ path: name, message: 'Invalid id' }]));
}
