/**
 * Vercel serverless entrypoint.
 *
 * vercel.json rewrites all /api/* traffic here. Express is itself a
 * (req, res) handler, so exporting the app directly is enough — no
 * adapter needed. The original req.url (including /api prefix) is
 * preserved, so the routes mounted at /api/auth etc. match normally.
 */
import app from '../backend/src/app.js';
export default app;
