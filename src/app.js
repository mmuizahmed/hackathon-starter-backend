import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { attachUser, blockIfPasswordChangeRequired } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import apiRoutes from './routes/index.js';

const app = express();

// Render is one proxy hop in front of us. The login limiter then sees the real client IP.
if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
// A list (not "*") so a browser on another site does not receive this origin.
// Requests with no Origin header, such as the smoke script, still get a normal response.
app.use(
  cors({
    origin: [env.clientUrl],
    credentials: true,
  })
);

if (env.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Both parsers share one limit so a large JSON or form body is rejected before a controller sees it.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// 1. Read the cookie and load the user. A missing cookie is not an error.
// 2. Block temporary passwords before they reach any module route.
app.use(attachUser);
app.use(blockIfPasswordChangeRequired);

app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
