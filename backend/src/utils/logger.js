/**
 * Minimal structured logger.
 * Keeps console output consistent and timestamped without pulling
 * in a heavy logging dependency.
 */
const ts = () => new Date().toISOString();

const logger = {
  info: (...args) => console.log(`[INFO ] ${ts()}`, ...args),
  warn: (...args) => console.warn(`[WARN ] ${ts()}`, ...args),
  error: (...args) => console.error(`[ERROR] ${ts()}`, ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] ${ts()}`, ...args);
    }
  },
};

export default logger;
