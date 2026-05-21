/**
 * Local development launcher. On Vercel, api/index.js loads the same
 * Express app without calling listen().
 */
import app from './app.js';
import config from './utils/config.js';
import logger from './utils/logger.js';

app.listen(config.port, () => {
  logger.info(
    `Warehouse Scanner API running on http://localhost:${config.port} (${config.nodeEnv})`
  );
});
