const BEARER = /(Authorization\s*[:=]\s*Bearer\s+)(\S+)/gi;
const BEARER_TOKEN = /(Bearer\s+)([A-Za-z0-9._\-]{8,})/gi;
const ENV_KEY = /(TYPESAFE_API_KEY\s*[=:]\s*)(['"]?)([^\s'"]+)(['"]?)/gi;
const API_KEY_KWARG = /(api[_-]?key\s*[=:]\s*)(['"])([^'"]+)(['"])/gi;

/**
 * Redact API keys and Authorization headers from logs and error strings.
 * Never include the raw key or Authorization header in user-facing errors.
 */
export function redactSecrets(text: string): string {
  if (!text) {
    return text;
  }
  let out = text.replace(BEARER, "$1[REDACTED]");
  out = out.replace(BEARER_TOKEN, "$1[REDACTED]");
  out = out.replace(ENV_KEY, "$1$2[REDACTED]$4");
  out = out.replace(API_KEY_KWARG, "$1$2[REDACTED]$4");
  return out;
}

/** Stringify an exception without leaking secrets that may appear in message/stack. */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ? `\n${error.stack}` : "";
    return redactSecrets(`${error.name}: ${error.message}${stack}`).split("\n")[0] ?? "Error";
  }
  return redactSecrets(String(error));
}
