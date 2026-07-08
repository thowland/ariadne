import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 1_048_576; // rotate at 1 MB, keep one previous file

/**
 * Minimal main-process logger: appends timestamped lines to
 * <userData>/logs/main.log with single-step rotation. Synchronous by design —
 * it is only used for rare error/lifecycle events.
 */
export class LoggerService {
  private readonly logDir: string;
  private readonly logPath: string;

  constructor(
    userDataDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.logDir = join(userDataDir, 'logs');
    this.logPath = join(this.logDir, 'main.log');
  }

  log(level: 'info' | 'error', message: string): void {
    try {
      mkdirSync(this.logDir, { recursive: true });
      this.rotateIfNeeded();
      appendFileSync(this.logPath, `${this.now().toISOString()} [${level}] ${message}\n`, 'utf8');
    } catch {
      // Logging must never take the app down.
    }
  }

  error(message: string): void {
    this.log('error', message);
  }

  info(message: string): void {
    this.log('info', message);
  }

  private rotateIfNeeded(): void {
    if (!existsSync(this.logPath)) return;
    if (statSync(this.logPath).size < MAX_BYTES) return;
    renameSync(this.logPath, `${this.logPath}.1`);
  }
}
