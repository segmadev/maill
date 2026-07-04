/**
 * templateUtils.js
 *
 * Shared utilities for the bulk-send template system.
 *
 *  • tryDecodeBase64   — attempt atob() on any string, return null on failure
 *  • tryDecodeBase64Email — same, but only returns a value if the decoded
 *                          result is a valid email address
 *  • resolveTemplate   — replace {{key}} tokens in a template string with
 *                        values from a data object.  Uses a three-pass fuzzy
 *                        engine that handles missing/extra braces and spaces.
 */

export const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/

/** Attempt to base64-decode any string. Returns the decoded string or null. */
export function tryDecodeBase64(str) {
  if (typeof str !== 'string' || str.length < 4) return null
  try { return atob(str.trim()) } catch { return null }
}

/**
 * Attempt to base64-decode a string and return the result only when the
 * decoded value is a valid email address.  Ignores strings that contain
 * characters not valid in base64 payloads.
 */
export function tryDecodeBase64Email(str) {
  if (typeof str !== 'string' || str.length < 8) return null
  if (!/^[A-Za-z0-9+/]+=*$/.test(str.trim())) return null
  const decoded = tryDecodeBase64(str)
  return decoded && EMAIL_RE.test(decoded.trim()) ? decoded.trim() : null
}

/**
 * resolveTemplate(template, data, base64Fields?)
 *
 * Replaces {{key}} tokens in `template` with corresponding values from
 * the `data` object.
 *
 * Fuzzy matching — three passes, most-specific first:
 *
 *   Pass 1: proper   {{key}}  {{key:mod}}  {{ key }}   (spaces, optional modifier)
 *   Pass 2: one }    {{key}   {{key:mod}
 *   Pass 3: no }     {{key    (only when the key is followed by a word boundary
 *                    or non-brace/non-word character so we don't eat prose text)
 *
 * Modifier support:
 *   {{key:raw}}  → skip base64 decoding, return the raw stored value
 *   {{key}}      → auto-decode if the field is listed in base64Fields
 *
 * Unknown keys are left untouched (returned as the original match string)
 * so the admin can still see which variables were not resolved.
 *
 * @param {string}           template
 * @param {Record<string,any>} data
 * @param {Set<string>|string[]} [base64Fields]   fields whose values are base64-encoded
 * @returns {string}
 */
export function resolveTemplate(template, data, base64Fields = []) {
  if (!template) return ''
  if (!data)     return template

  const b64Set = base64Fields instanceof Set
    ? base64Fields
    : new Set(base64Fields)

  /**
   * Resolve a single matched key.
   * Returns the substituted string, or `fallback` if the key is unknown.
   */
  function getVal(key, modifier, fallback) {
    const trimmedKey = key.trim()
    // Check for the key exactly, then case-insensitively as a fallback
    const resolvedKey =
      trimmedKey in data
        ? trimmedKey
        : Object.keys(data).find(k => k.toLowerCase() === trimmedKey.toLowerCase())

    if (resolvedKey === undefined) return fallback  // unknown variable — leave as-is

    const raw = data[resolvedKey]

    // :raw modifier — skip any decoding
    if (modifier === 'raw') return String(raw ?? '')

    // Auto-decode base64 fields (unless modifier explicitly said :raw above)
    if (b64Set.has(resolvedKey)) {
      const decoded = tryDecodeBase64(String(raw ?? ''))
      if (decoded) return decoded.trim()
    }

    return String(raw ?? '')
  }

  let result = template

  // ── Pass 1: proper {{key}} or {{ key }} or {{key:mod}} ───────────────────
  result = result.replace(
    /\{\{[ \t]*(\w+)[ \t]*(?::(\w+))?[ \t]*\}\}/g,
    (m, k, mod) => getVal(k, mod, m),
  )

  // ── Pass 2: single closing brace {{key} or {{key:mod} ────────────────────
  result = result.replace(
    /\{\{[ \t]*(\w+)[ \t]*(?::(\w+))?[ \t]*\}/g,
    (m, k, mod) => getVal(k, mod, m),
  )

  // ── Pass 3: no closing brace — {{key must be followed by a word boundary  ─
  // (space, punctuation, newline, quote, or end-of-string) to avoid
  // accidentally matching inside CSS / other curly-brace syntax.
  result = result.replace(
    /\{\{[ \t]*(\w+)[ \t]*(?::(\w+))?(?=[\s,.:;!?()\[\]<>"'\n\r]|$)/g,
    (m, k, mod) => getVal(k, mod, m),
  )

  return result
}
