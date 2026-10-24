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

  const jwtSecret = (process.env.JWT_SECRET || '').trim();
  if (jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters.');
  }

  // Both or neither. Leave them empty so judges use the setup screen on an empty database.
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const companyName = (process.env.COMPANY_NAME || '').trim();
  if (Boolean(adminEmail) !== Boolean(adminPassword)) {
    throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD, or leave both empty.');
  }
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }
  if (adminPassword && (adminPassword.length < 8 || adminPassword.length > 72)) {
    throw new Error('ADMIN_PASSWORD must be 8 to 72 characters.');
  }
  if (companyName.length > 120) {
    throw new Error('COMPANY_NAME must be at most 120 characters.');
  }

  // Used later by the AI module. The browser never receives this value.
  const aiApiKey = (process.env.AI_API_KEY || '').trim();

  return {
    nodeEnv,
    port,
    clientUrl: parsedClientUrl.origin,
    mongodbUri,
    jwtSecret,
    adminEmail,
    adminPassword,
    companyName,
    aiApiKey,
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
