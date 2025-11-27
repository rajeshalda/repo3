/**
 * PRODUCTION-SAFE NDJSON LOGGER (JavaScript version)
 * For use in ai-agent-server.js and other .js files
 */

const fs = require('fs');
const path = require('path');

class NDJSONLogger {
  constructor(logsDir = 'C:\\AppLogs') {
    this.logsDir = logsDir;
    this.currentUser = null;
    this.traceId = null;
    this.enabled = true;
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (error) {
      console.error('[NDJSON Logger] Failed to create logs directory:', error);
      this.enabled = false;
    }
  }

  setUser(userEmail) {
    this.currentUser = userEmail;
    this.traceId = this.generateTraceId();

    if (this.currentUser) {
      const userDir = path.join(this.logsDir, this.sanitizeFilename(this.currentUser));
      try {
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
      } catch (error) {
        console.error('[NDJSON Logger] Failed to create user directory:', error);
      }
    }
  }

  clearUser() {
    this.currentUser = null;
    this.traceId = null;
  }

  generateTraceId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getDateString() {
    return new Date().toISOString().split('T')[0];
  }

  sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_');
  }

  getLogFilePath(isFull = false) {
    if (!this.currentUser) {
      return null;
    }

    const userDir = path.join(this.logsDir, this.sanitizeFilename(this.currentUser));
    const dateStr = this.getDateString();
    const filename = isFull ? `${dateStr}-full.ndjson` : `${dateStr}.ndjson`;

    return path.join(userDir, filename);
  }

  writeLog(entry, isFull = false) {
    if (!this.enabled) {
      return;
    }

    const filePath = this.getLogFilePath(isFull);
    if (!filePath) {
      return;
    }

    try {
      const logLine = JSON.stringify(entry) + '\n';

      fs.appendFile(filePath, logLine, 'utf8', (error) => {
        if (error) {
          console.error('[NDJSON Logger] Write failed (non-critical):', error.message);
        }
      });
    } catch (error) {
      console.error('[NDJSON Logger] Log write error (non-critical):', error);
    }
  }

  log(level, event, message, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      ...(this.currentUser && { user: this.currentUser }),
      ...(this.traceId && { trace_id: this.traceId }),
      ...(data && { data })
    };

    this.writeLog(entry, false);

    if (data || level === 'error') {
      this.writeLog(entry, true);
    }

    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(`[${level.toUpperCase()}] ${message}`, data || '');
  }

  info(event, message, data) {
    this.log('info', event, message, data);
  }

  warn(event, message, data) {
    this.log('warn', event, message, data);
  }

  error(event, message, error, data) {
    const errorData = {
      ...(data || {}),
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    };
    this.log('error', event, message, errorData);
  }

  debug(event, message, data) {
    if (!this.enabled || !this.currentUser) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      event,
      message,
      user: this.currentUser,
      trace_id: this.traceId || undefined,
      ...(data && { data })
    };

    this.writeLog(entry, true);
  }
}

// Export singleton instance
const ndjsonLogger = new NDJSONLogger();

module.exports = {
  ndjsonLogger,
  setLogUser: (userEmail) => ndjsonLogger.setUser(userEmail),
  clearLogUser: () => ndjsonLogger.clearUser(),
  logInfo: (event, message, data) => ndjsonLogger.info(event, message, data),
  logWarn: (event, message, data) => ndjsonLogger.warn(event, message, data),
  logError: (event, message, error, data) => ndjsonLogger.error(event, message, error, data),
  logDebug: (event, message, data) => ndjsonLogger.debug(event, message, data)
};
