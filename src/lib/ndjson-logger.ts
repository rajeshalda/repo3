/**
 * PRODUCTION-SAFE NDJSON LOGGER
 *
 * SAFETY GUARANTEES:
 * ✅ Non-blocking async writes
 * ✅ Silent failure (never crashes app)
 * ✅ Zero dependencies (uses built-in Node.js fs)
 * ✅ Per-user folder isolation
 * ✅ Dual logs: summary + full details
 * ✅ No breaking changes to existing code
 */

import fs from 'fs';
import path from 'path';

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  user?: string;
  event: string;
  message: string;
  data?: any;
  trace_id?: string;
  duration_ms?: number;
  error?: string;
  [key: string]: any;
}

class NDJSONLogger {
  private logsDir: string;
  private currentUser: string | null = null;
  private traceId: string | null = null;
  private enabled: boolean = true;

  constructor(logsDir: string = 'C:\\AppLogs') {
    this.logsDir = logsDir;
    this.ensureLogsDirectory();
  }

  /**
   * Ensure logs directory exists (synchronous, called once at startup)
   */
  private ensureLogsDirectory(): void {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (error) {
      // Silent failure - logs won't work but app continues
      console.error('[NDJSON Logger] Failed to create logs directory:', error);
      this.enabled = false;
    }
  }

  /**
   * Set current user context for logging
   */
  setUser(userEmail: string): void {
    this.currentUser = userEmail;
    this.traceId = this.generateTraceId();

    // Ensure user directory exists
    if (this.currentUser) {
      const userDir = path.join(this.logsDir, this.sanitizeFilename(this.currentUser));
      try {
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
      } catch (error) {
        // Silent failure
        console.error('[NDJSON Logger] Failed to create user directory:', error);
      }
    }
  }

  /**
   * Clear user context
   */
  clearUser(): void {
    this.currentUser = null;
    this.traceId = null;
  }

  /**
   * Generate unique trace ID for correlation
   */
  private generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current date string for filename
   */
  private getDateString(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Sanitize filename to remove invalid characters
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_');
  }

  /**
   * Get log file path for current user and date
   */
  private getLogFilePath(isFull: boolean = false): string | null {
    if (!this.currentUser) {
      return null;
    }

    const userDir = path.join(this.logsDir, this.sanitizeFilename(this.currentUser));
    const dateStr = this.getDateString();
    const filename = isFull ? `${dateStr}-full.ndjson` : `${dateStr}.ndjson`;

    return path.join(userDir, filename);
  }

  /**
   * Write log entry to file (async, non-blocking)
   * CRITICAL: This method NEVER throws errors to prevent app crashes
   */
  private async writeLog(entry: LogEntry, isFull: boolean = false): Promise<void> {
    if (!this.enabled) {
      return; // Logging disabled due to initialization failure
    }

    const filePath = this.getLogFilePath(isFull);
    if (!filePath) {
      return; // No user context set, skip logging
    }

    try {
      const logLine = JSON.stringify(entry) + '\n';

      // Async append - non-blocking
      fs.appendFile(filePath, logLine, 'utf8', (error) => {
        if (error) {
          // Silent failure - log to console but don't crash
          console.error('[NDJSON Logger] Write failed (non-critical):', error.message);
        }
      });
    } catch (error) {
      // Silent failure - catch any synchronous errors
      console.error('[NDJSON Logger] Log write error (non-critical):', error);
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogEntry['level'], event: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      ...(this.currentUser && { user: this.currentUser }),
      ...(this.traceId && { trace_id: this.traceId }),
      ...(data && { data })
    };

    // Write to summary log (always)
    this.writeLog(entry, false);

    // Write to full log (only if there's data or it's an error)
    if (data || level === 'error') {
      this.writeLog(entry, true);
    }

    // IMPORTANT: Still output to console for immediate visibility
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(`[${level.toUpperCase()}] ${message}`, data || '');
  }

  /**
   * Public logging methods
   */
  info(event: string, message: string, data?: any): void {
    this.log('info', event, message, data);
  }

  warn(event: string, message: string, data?: any): void {
    this.log('warn', event, message, data);
  }

  error(event: string, message: string, error?: Error | string, data?: any): void {
    const errorData = {
      ...(data || {}),
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    };
    this.log('error', event, message, errorData);
  }

  debug(event: string, message: string, data?: any): void {
    // Debug logs only go to full log
    if (!this.enabled || !this.currentUser) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      event,
      message,
      user: this.currentUser,
      trace_id: this.traceId || undefined,
      ...(data && { data })
    };

    this.writeLog(entry, true); // Only to full log
  }

  /**
   * Log with custom fields
   */
  custom(level: LogEntry['level'], event: string, message: string, fields: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      user: this.currentUser || undefined,
      trace_id: this.traceId || undefined,
      ...fields
    };

    this.writeLog(entry, level === 'error' || level === 'debug');

    // Also log to console
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(`[${level.toUpperCase()}] ${message}`, fields);
  }

  /**
   * Start a timed operation (returns a function to end it)
   */
  startTimer(event: string, message: string): () => void {
    const startTime = Date.now();
    this.info(event + '_started', message);

    return () => {
      const duration = Date.now() - startTime;
      this.custom('info', event + '_completed', `${message} (completed)`, {
        duration_ms: duration
      });
    };
  }
}

// Export singleton instance
export const ndjsonLogger = new NDJSONLogger();

// Export convenience functions for backward compatibility
export const setLogUser = (userEmail: string) => ndjsonLogger.setUser(userEmail);
export const clearLogUser = () => ndjsonLogger.clearUser();
export const logInfo = (event: string, message: string, data?: any) => ndjsonLogger.info(event, message, data);
export const logWarn = (event: string, message: string, data?: any) => ndjsonLogger.warn(event, message, data);
export const logError = (event: string, message: string, error?: Error | string, data?: any) => ndjsonLogger.error(event, message, error, data);
export const logDebug = (event: string, message: string, data?: any) => ndjsonLogger.debug(event, message, data);
export const startTimer = (event: string, message: string) => ndjsonLogger.startTimer(event, message);
