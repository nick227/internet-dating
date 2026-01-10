/**
 * Simple structured logger for server-side logging
 * Uses console with structured JSON output for production monitoring
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

type LogContext = Record<string, unknown>

function log(level: LogLevel, message: string, context?: LogContext): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    ...context,
  }
  
  // In production, this would go to a logging service
  // For now, output to console with appropriate level
  const output = JSON.stringify(logEntry)
  
  switch (level) {
    case 'error':
      console.error(output)
      break
    case 'warn':
      console.warn(output)
      break
    case 'debug':
      console.debug(output)
      break
    case 'info':
    default:
      console.log(output)
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
  debug: (message: string, context?: LogContext) => log('debug', message, context),
}
