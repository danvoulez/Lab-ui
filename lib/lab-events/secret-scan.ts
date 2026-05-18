// Defense-in-depth: even if a LAB Host Runtime forgets to redact a value,
// the Control Plane rejects events whose evidence_json contains a non-null
// value under any of these field names (case-insensitive, anywhere in the
// nested structure). The first match wins.

const FORBIDDEN_FIELD_NAME_PATTERNS = [
  /\btoken\b/i,
  /\bapi_key\b/i,
  /\bapikey\b/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /\bservice_role_key\b/i,
  /\bbearer\b/i,
  /\bprivate_key\b/i,
]

export interface SecretLikeMatch {
  path: string
  reason: 'forbidden_field_name_with_value'
}

export function scanForSecretLikeFields(
  evidence: unknown,
  basePath = '$',
): SecretLikeMatch | null {
  if (evidence === null || evidence === undefined) {
    return null
  }
  if (Array.isArray(evidence)) {
    for (let i = 0; i < evidence.length; i++) {
      const hit = scanForSecretLikeFields(evidence[i], `${basePath}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (typeof evidence === 'object') {
    for (const [key, value] of Object.entries(evidence as Record<string, unknown>)) {
      const path = `${basePath}.${key}`
      if (value !== null && value !== undefined && value !== '') {
        for (const pattern of FORBIDDEN_FIELD_NAME_PATTERNS) {
          if (pattern.test(key)) {
            return { path, reason: 'forbidden_field_name_with_value' }
          }
        }
      }
      const hit = scanForSecretLikeFields(value, path)
      if (hit) return hit
    }
  }
  return null
}
