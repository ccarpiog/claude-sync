import { logger } from './logger.js';

export function printLogo(): void {
  logger.banner('CLAUDE-SYNC', 'A companion for syncing Claude Code');
}
