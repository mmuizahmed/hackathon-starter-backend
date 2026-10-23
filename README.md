# Hackathon starter backend

A small Express API you can clone at the start of a hackathon and extend. It connects to MongoDB when you give it a URI, exposes a health check, and returns the same JSON shape for every success and error.

It does not include assignment features. Add those with the recipe at the bottom once the brief is known.

## Setup

1. Install [Node.js 20](https://nodejs.org/) or newer.
2. Install dependencies:

```bash
npm install
```

3. Create your local env file and edit it:

```bash
cp .env.example .env
```

4. Start MongoDB on your machine, or leave `MONGODB_URI` empty. An empty URI is valid: the API still starts, and the health check reports `db: "disconnected"`.
5. Start the server:

```bash
npm run dev
```

6. Check it:

```bash
curl http://localhost:5000/api/health
```

Example when MongoDB is connected:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptime": 3,
    "db": "connected"
  }
}
```

`uptime` is whole seconds since the process started.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `5000` | Port the API listens on. Render sets this in production. |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production`. Request logs are printed only in development. |
| `MONGODB_URI` | No | empty | MongoDB connection string. Empty means start without a database. |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend origin allowed by CORS. Use the scheme, host, and port only, for example `http://localhost:5173`. |

The process checks these values before it listens. A bad `PORT`, `NODE_ENV`, `CLIENT_URL`, or `MONGODB_URI` stops startup with a `Configuration error:` message.

Copy names from `.env.example`. Do not commit `.env`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the API and restarts it when you change a file (`node --watch`). |
| `npm start` | Starts the API once. Use this in production. |
| `npm test` | Runs the health-check test. No database required. |

## Response shape

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{ "success": false, "message": "What went wrong" }
```

Unknown routes return `404` with that error shape. A controller can set `error.statusCode` (for example `400` or `404`) and the central error handler will use it. In production, unexpected server errors return the message `Internal server error` so internal details stay in the server log.

## Folder structure

```text
src/
  server.js                 starts the process and connects to MongoDB
  app.js                    Express app: security, JSON, routes, errors
  config/
    env.js                  loads and checks environment variables
    db.js                   MongoDB connection
  routes/
    index.js                mount new routers here
    health.routes.js
  controllers/
    health.controller.js
  middleware/
    notFound.js             unknown routes
    errorHandler.js         every thrown error becomes JSON
  utils/
    asyncHandler.js         sends async errors to the error handler
    response.js             sendSuccess(res, data)
tests/
  health.test.js
```

A request goes through `app.js`, then a router, then a controller. The controller sends `{ success: true, data }` or throws. Thrown errors end in `errorHandler`.

## Deploy on Render

`render.yaml` describes a Node web service:

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`

Steps:

1. Push this repository to GitHub.
2. Create a MongoDB Atlas cluster and a database user. Copy the connection string. Under Network Access, allow `0.0.0.0/0` so Render can reach the cluster.
3. In Render, choose **New + Blueprint** and select this repo. Render reads `render.yaml`. To do it by hand instead, create a **Web Service** with the build command, start command, and health check path above.
4. Set environment variables on the service:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = your Atlas connection string
   - `CLIENT_URL` = the live frontend origin, such as `https://your-app.vercel.app`
5. Leave `PORT` unset. Render provides it.
6. Deploy, then open `https://<your-service>.onrender.com/api/health`. When Atlas accepts the connection, `data.db` is `"connected"`.

## Add a route and a model

Example: a `notes` resource. Create these files, then mount the router.

`src/models/Note.js`

```javascript
import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Note = mongoose.model('Note', noteSchema);
```

`src/controllers/note.controller.js`

```javascript
import { Note } from '../models/Note.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const listNotes = asyncHandler(async (req, res) => {
  const notes = await Note.find().sort({ createdAt: -1 });
  sendSuccess(res, notes);
});

export const createNote = asyncHandler(async (req, res) => {
  const title = req.body?.title;
  if (!title) {
    const error = new Error('Title is required');
    error.statusCode = 400;
    throw error;
  }

  const note = await Note.create({ title, body: req.body.body || '' });
  sendSuccess(res, note, 201);
});
```

`src/routes/note.routes.js`

```javascript
import { Router } from 'express';
import { createNote, listNotes } from '../controllers/note.controller.js';

const router = Router();

router.get('/', listNotes);
router.post('/', createNote);

export default router;
```

In `src/routes/index.js`:

```javascript
import noteRoutes from './note.routes.js';

router.use('/notes', noteRoutes);
```

Restart `npm run dev`. The paths are `GET /api/notes` and `POST /api/notes`.

Wrap every `async` controller with `asyncHandler`. Express 4 does not catch a rejected promise on its own; the wrapper forwards it to `errorHandler`.

## Troubleshooting

- Health says `"db": "disconnected"`: `MONGODB_URI` is empty, MongoDB is not running, or the URI cannot be reached. The API stays up either way. Read the `MongoDB:` lines in the terminal.
- The browser blocks a request: set `CLIENT_URL` to the exact origin the page is served from, including `http` or `https` and the port.
- Startup prints `Configuration error`: fix the named variable in `.env`. The server does not listen until the values are valid.
