/**
 * Lightweight logger that suppresses debug output in production builds.
 *
 * - `logger.warn` and `logger.error` always emit (they indicate real problems).
 * - `logger.log` and `logger.info` only emit in dev mode (`import.meta.env.DEV`).
 *
 * Drop-in replacement for `console.log` / `console.error` / etc.
 */

const noop = (..._args: unknown[]) => {};

const isDev = import.meta.env.DEV;

export const logger = {
  /** Debug-level output — silenced in production. */
  log: isDev ? console.log.bind(console) : noop,

  /** Informational output — silenced in production. */
  info: isDev ? console.info.bind(console) : noop,

  /** Warnings — always emitted. */
  warn: console.warn.bind(console),

  /** Errors — always emitted. */
  error: console.error.bind(console),
};
