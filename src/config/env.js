const NODE_ENVS = ['development', 'test', 'production'];

function parseEnv() {
  const nodeEnv = (process.env.NODE_ENV || 'development').trim();
  if (!NODE_ENVS.includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}.`);
  }

  const port = Number((process.env.PORT || '5000').trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a whole number from 1 to 65535.');
  }

  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').trim();
  let parsedClientUrl;
  try {
    parsedClientUrl = new URL(clientUrl);
  } catch {
    throw new Error('CLIENT_URL must be a full URL, for example http://localhost:5173.');
  }
  if (parsedClientUrl.protocol !== 'http:' && parsedClientUrl.protocol !== 'https:') {
    throw new Error('CLIENT_URL must start with http:// or https://.');
  }

  const mongodbUri = (process.env.MONGODB_URI || '').trim();
  if (
    mongodbUri &&
    !mongodbUri.startsWith('mongodb://') &&
    !mongodbUri.startsWith('mongodb+srv://')
  ) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  }

  return {
    nodeEnv,
    port,
    clientUrl: parsedClientUrl.origin,
    mongodbUri,
  };
}

let env;
try {
  env = parseEnv();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}

export { env };
