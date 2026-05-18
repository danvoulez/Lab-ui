import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { labEventSchema } from '@/lib/lab-events/types'
import { scanForSecretLikeFields } from '@/lib/lab-events/secret-scan'
import { deriveCurrentState } from '@/lib/lab-events/state-derivation'
import { authenticateIngest, IngestAuthMissingError } from '@/lib/lab-events/auth'

const goodEvent = {
  host_id: 'lab256',
  host_role: 'workbench' as const,
  runtime_version: '0.1.0',
  event_kind: 'HEARTBEAT_EMITTED' as const,
  component: 'heartbeat_loop',
  severity: 'info' as const,
  status: 'ok',
  observed_at: '2026-05-16T01:20:00Z',
  duration_ms: 12,
  evidence_json: { loop_index: 42, interval_ms: 60000 },
  next_action: null,
  secret_redacted: true as const,
  correlation_id: 'corr-1',
}

describe('lab-events schema validation', () => {
  it('accepts a well-formed event', () => {
    const parsed = labEventSchema.safeParse(goodEvent)
    expect(parsed.success).toBe(true)
  })

  it('rejects secret_redacted=false', () => {
    const parsed = labEventSchema.safeParse({ ...goodEvent, secret_redacted: false })
    expect(parsed.success).toBe(false)
  })

  it('rejects missing secret_redacted', () => {
    const { secret_redacted, ...rest } = goodEvent
    void secret_redacted
    const parsed = labEventSchema.safeParse(rest)
    expect(parsed.success).toBe(false)
  })

  it('rejects unknown host_role', () => {
    const parsed = labEventSchema.safeParse({ ...goodEvent, host_role: 'governor' })
    expect(parsed.success).toBe(false)
  })

  it('rejects unknown event_kind', () => {
    const parsed = labEventSchema.safeParse({ ...goodEvent, event_kind: 'WORLD_ENDED' })
    expect(parsed.success).toBe(false)
  })

  it('rejects additional top-level properties', () => {
    const parsed = labEventSchema.safeParse({ ...goodEvent, extra: 'no' })
    expect(parsed.success).toBe(false)
  })

  it('rejects non-RFC3339 observed_at', () => {
    const parsed = labEventSchema.safeParse({ ...goodEvent, observed_at: 'yesterday' })
    expect(parsed.success).toBe(false)
  })
})

describe('lab-events secret scanner (defense in depth)', () => {
  it('passes evidence with only neutral field names', () => {
    expect(
      scanForSecretLikeFields({ loop_index: 1, host_id: 'lab256' }),
    ).toBeNull()
  })

  it('flags a top-level token field with a value', () => {
    const hit = scanForSecretLikeFields({ token: 'abc' })
    expect(hit).not.toBeNull()
    expect(hit?.path).toMatch(/token/)
  })

  it('flags nested service_role_key under array', () => {
    const hit = scanForSecretLikeFields({
      attempts: [{ ok: false }, { service_role_key: 'xyz' }],
    })
    expect(hit?.path).toContain('service_role_key')
  })

  it('does not flag an empty-string forbidden field (already redacted)', () => {
    expect(scanForSecretLikeFields({ password: '' })).toBeNull()
  })

  it('does not flag a null forbidden field (already redacted)', () => {
    expect(scanForSecretLikeFields({ api_key: null })).toBeNull()
  })

  it('flags any of token / api_key / password / secret / bearer / private_key', () => {
    for (const field of [
      'token',
      'api_key',
      'password',
      'secret',
      'bearer',
      'private_key',
    ]) {
      expect(scanForSecretLikeFields({ [field]: 'value' })).not.toBeNull()
    }
  })
})

describe('lab-events state derivation (pure)', () => {
  it('heartbeat sets state=observed and leaves stability_state alone', () => {
    const r = deriveCurrentState({ event_kind: 'HEARTBEAT_EMITTED' })
    expect(r.state).toBe('observed')
    expect(r.stability_state).toBeUndefined()
  })

  it('HEALTH_CHECK_PASSED sets stability_state=ok and clears last_error', () => {
    const r = deriveCurrentState({ event_kind: 'HEALTH_CHECK_PASSED' })
    expect(r.stability_state).toBe('ok')
    expect(r.last_error).toBeNull()
  })

  it('HEALTH_CHECK_FAILED sets stability_state=degraded and records next_action', () => {
    const r = deriveCurrentState({
      event_kind: 'HEALTH_CHECK_FAILED',
      next_action: 'restart launchd',
    })
    expect(r.stability_state).toBe('degraded')
    expect(r.last_error).toBe('restart launchd')
  })

  it('DOCTOR_PASSED only marks observed, no stability change', () => {
    const r = deriveCurrentState({ event_kind: 'DOCTOR_PASSED' })
    expect(r.state).toBe('observed')
    expect(r.stability_state).toBeUndefined()
  })

  it('SMOKE_FAILED marks degraded and observed', () => {
    const r = deriveCurrentState({ event_kind: 'SMOKE_FAILED' })
    expect(r.state).toBe('observed')
    expect(r.stability_state).toBe('degraded')
  })

  it('CLOUDFLARED_FAILED marks degraded without changing state', () => {
    const r = deriveCurrentState({ event_kind: 'CLOUDFLARED_FAILED' })
    expect(r.state).toBeUndefined()
    expect(r.stability_state).toBe('degraded')
  })

  it('BREAK_GLASS_CONFIRMED_OFF is a no-op for state/stability', () => {
    const r = deriveCurrentState({ event_kind: 'BREAK_GLASS_CONFIRMED_OFF' })
    expect(r.state).toBeUndefined()
    expect(r.stability_state).toBeUndefined()
  })

  it('records runtime_version when provided', () => {
    const r = deriveCurrentState({
      event_kind: 'HEARTBEAT_EMITTED',
      runtime_version: '0.1.0',
    })
    expect(r.runtime_version).toBe('0.1.0')
  })
})

describe('lab-events bearer auth', () => {
  let savedToken: string | undefined

  beforeEach(() => {
    savedToken = process.env.CONTROL_PLANE_INGEST_TOKEN
  })
  afterEach(() => {
    if (savedToken === undefined) {
      delete process.env.CONTROL_PLANE_INGEST_TOKEN
    } else {
      process.env.CONTROL_PLANE_INGEST_TOKEN = savedToken
    }
  })

  it('throws IngestAuthMissingError when token env is absent', () => {
    delete process.env.CONTROL_PLANE_INGEST_TOKEN
    expect(() =>
      authenticateIngest(
        new Request('http://example/x', { headers: { Authorization: 'Bearer abc' } }),
      ),
    ).toThrow(IngestAuthMissingError)
  })

  it('rejects missing Authorization header', () => {
    process.env.CONTROL_PLANE_INGEST_TOKEN = 'abc'
    const out = authenticateIngest(new Request('http://example/x'))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe('missing_or_malformed_authorization')
  })

  it('rejects wrong token', () => {
    process.env.CONTROL_PLANE_INGEST_TOKEN = 'abc'
    const out = authenticateIngest(
      new Request('http://example/x', { headers: { Authorization: 'Bearer xyz' } }),
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe('invalid_token')
  })

  it('accepts matching bearer token', () => {
    process.env.CONTROL_PLANE_INGEST_TOKEN = 'matching-token'
    const out = authenticateIngest(
      new Request('http://example/x', {
        headers: { Authorization: 'Bearer matching-token' },
      }),
    )
    expect(out.ok).toBe(true)
  })
})
