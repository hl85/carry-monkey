import { createComponentLogger } from './logger';

// 创建匹配器专用日志器
const matcherLogger = createComponentLogger('Matcher');

/**
 * Converts a match pattern string into a regular expression.
 * This is the core of the matching logic, following Chrome's extension match pattern rules.
 * @param pattern The match pattern string (e.g., "https://*.google.com/*").
 * @returns A RegExp object that can be used to test URLs.
 */
function patternToRegExp(pattern: string): RegExp {
  if (pattern === '<all_urls>') {
    return /^(https?|file|ftp|chrome-extension):\/\//;
  }

  const schemeMatch = pattern.match(/^(https?|\*):\/\//);
  if (!schemeMatch) {
    throw new Error(`Invalid match pattern: ${pattern}. Must start with a valid scheme.`);
  }

  const [scheme, ...rest] = pattern.split('://');
  const [host, path] = rest.join('://').split('/');
  
  // Scheme conversion
  const schemeRegex = scheme === '*' ? 'https?|ftp' : scheme;

  // Host conversion
  let hostRegex = host.replace(/\./g, '\\.'); // Escape dots
  if (hostRegex.startsWith('*\\.')) {
    // Subdomain wildcard
    hostRegex = `([^/]+\\.)?${hostRegex.substring(2)}`;
  }
  hostRegex = hostRegex.replace(/\*/g, '[^/]*'); // Other wildcards

  // Path conversion
  const pathRegex = '/' + (path || '').replace(/\*/g, '.*');

  return new RegExp(`^${schemeRegex}://${hostRegex}${pathRegex}$`);
}

/**
 * Checks if a given URL matches against a list of patterns.
 * @param url The URL to test.
 * @param patterns An array of match pattern strings.
 * @returns `true` if the URL matches any of the patterns, `false` otherwise.
 */
export function matches(url: string, patterns: string[]): boolean {
  if (!url) return false;
  return patterns.some(pattern => {
    try {
      const regex = patternToRegExp(pattern);
      return regex.test(url);
    } catch (e) {
      matcherLogger.error('Pattern matching failed', {
        url,
        pattern,
        error: (e as Error).message
      });
      return false;
    }
  });
}
