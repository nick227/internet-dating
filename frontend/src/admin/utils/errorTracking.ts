/**
 * Error tracking utility for Job Manager
 * Centralized error logging with context for debugging
 */

interface ErrorContext {
  action: string;
  component?: string;
  jobName?: string;
  jobRunId?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export class JobManagerError extends Error {
  context: ErrorContext;
  timestamp: string;

  constructor(message: string, context: ErrorContext) {
    super(message);
    this.name = 'JobManagerError';
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Track an error with context
 */
export function trackError(error: Error | unknown, context: ErrorContext): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  const enrichedContext = {
    ...context,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  // Console logging for development
  console.error('[Job Manager Error]', {
    message: errorObj.message,
    stack: errorObj.stack,
    context: enrichedContext
  });

  // TODO: Add production error tracking here
  // Examples:
  // - Sentry.captureException(errorObj, { extra: enrichedContext });
  // - LogRocket.captureException(errorObj, enrichedContext);
  // - Custom API: fetch('/api/errors', { method: 'POST', body: JSON.stringify(...) });

  // Store recent errors in sessionStorage for debugging
  storeRecentError(errorObj, enrichedContext);
}

/**
 * Track a warning (non-critical issue)
 */
export function trackWarning(message: string, context: ErrorContext): void {
  console.warn('[Job Manager Warning]', {
    message,
    context: {
      ...context,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Store recent errors for debugging (last 10)
 */
function storeRecentError(error: Error, context: Record<string, unknown>): void {
  try {
    const stored = sessionStorage.getItem('jobManagerErrors');
    const errors = stored ? JSON.parse(stored) : [];
    
    errors.push({
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines
      context,
      timestamp: new Date().toISOString()
    });

    // Keep only last 10 errors
    if (errors.length > 10) {
      errors.shift();
    }

    sessionStorage.setItem('jobManagerErrors', JSON.stringify(errors));
  } catch (err) {
    // Ignore storage errors
    console.warn('Failed to store error in sessionStorage:', err);
  }
}

/**
 * Get recent errors for debugging
 */
export function getRecentErrors(): Array<{
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  timestamp: string;
}> {
  try {
    const stored = sessionStorage.getItem('jobManagerErrors');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Clear stored errors
 */
export function clearRecentErrors(): void {
  try {
    sessionStorage.removeItem('jobManagerErrors');
  } catch {
    // Ignore
  }
}

/**
 * Create a tracked async function wrapper
 */
export function trackAsync<T>(
  fn: () => Promise<T>,
  context: ErrorContext
): Promise<T> {
  return fn().catch((error) => {
    trackError(error, context);
    throw error; // Re-throw for caller to handle
  });
}
