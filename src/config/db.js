import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.connection.on('error', (error) => {
  console.error(`MongoDB error: ${error.message}`);
});

export function getDbStatus() {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

export async function connectDb() {
  if (!env.mongodbUri) {
    console.log('MongoDB: MONGODB_URI is not set. Starting without a database.');
    return;
  }

  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    const { host, name } = mongoose.connection;
    console.log(`MongoDB: connected to ${host}/${name || '(no database name)'}`);
  } catch (error) {
    console.error(
      'MongoDB: connection failed. The API will keep running and /api/health will report db "disconnected".'
    );
    console.error(`MongoDB: ${error.message}`);
    await mongoose.disconnect().catch(() => {});
  }
}
