/*
 * Project-wide browser diagnostics.
 * This reports technical failures to DevTools but never logs request bodies,
 * credentials, authentication tokens, or page form data.
 */
(() => {
  if (window.__nakconelErrorLoggerInstalled) return;
  window.__nakconelErrorLoggerInstalled = true;

  const log = (context, error, details = {}) => {
    console.error(`[NAKCONEL] ${context}`, {
      message: error instanceof Error ? error.message : String(error || 'Unknown error'),
      ...details
    });
  };

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window) {
      const resourceUrl = target.currentSrc || target.src || target.href;
      log('Page resource failed to load', new Error(target.tagName || 'Resource error'), { resourceUrl });
      return;
    }
    log('Unhandled page error', event.error || event.message, {
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    log('Unhandled promise rejection', event.reason);
  });

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const request = args[0];
    const requestUrl = typeof request === 'string' ? request : request?.url;
    const requestOptions = args[1] || {};
    try {
      const response = await nativeFetch(...args);
      if (!response.ok) {
        console.warn('[NAKCONEL] HTTP request failed', {
          url: requestUrl,
          method: requestOptions.method || 'GET',
          status: response.status,
          statusText: response.statusText
        });
      }
      return response;
    } catch (error) {
      log('Network request failed', error, {
        url: requestUrl,
        method: requestOptions.method || 'GET'
      });
      throw error;
    }
  };
})();
