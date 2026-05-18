// Bearer-token auth for the lab-events ingress.
// The token value is provisioned by Doppler (config key
// CONTROL_PLANE_INGEST_TOKEN) and is shared with each LAB Host Runtime via
// its own Doppler config. We never log the token or compare it via plain
// string equality across short-circuits — use timingSafeEqual on byte buffers.

import { timingSafeEqual } from 'node:crypto'

export class IngestAuthMissingError extends Error {
  constructor() {
    super(
      'CONTROL_PLANE_INGEST_TOKEN is not configured. Run via ' +
        '`doppler run --project=minilab --config=<env> -- pnpm dev`.',
    )
    this.name = 'IngestAuthMissingError'
  }
}

export type AuthOutcome =
  | { ok: true }
  | { ok: false; status: 401; error: 'missing_or_malformed_authorization' }
  | { ok: false; status: 401; error: 'invalid_token' }

export function authenticateIngest(request: Request): AuthOutcome {
  const expected = process.env.CONTROL_PLANE_INGEST_TOKEN
  if (!expected) throw new IngestAuthMissingError()

  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) {
    return { ok: false, status: 401, error: 'missing_or_malformed_authorization' }
  }
  const presented = match[1].trim()
  const a = Buffer.from(presented, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) {
    return { ok: false, status: 401, error: 'invalid_token' }
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: 'invalid_token' }
  }
  return { ok: true }
}
