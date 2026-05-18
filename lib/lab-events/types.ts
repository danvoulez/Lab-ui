import { z } from 'zod'

export const HOST_ROLES = ['supervisor', 'inference', 'workbench'] as const
export type HostRole = (typeof HOST_ROLES)[number]

export const SEVERITIES = [
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
] as const
export type Severity = (typeof SEVERITIES)[number]

export const EVENT_KINDS = [
  'PACKAGE_DOWNLOADED',
  'PACKAGE_VERIFIED',
  'PACKAGE_INSTALLED',
  'DOPPLER_CONFIG_RESOLVED',
  'LAUNCHD_PLIST_INSTALLED',
  'LAUNCHD_BOOTSTRAPPED',
  'PROCESS_STARTED',
  'HEALTH_CHECK_PASSED',
  'HEALTH_CHECK_FAILED',
  'CLOUDFLARED_CONNECTED',
  'CLOUDFLARED_FAILED',
  'HEARTBEAT_EMITTED',
  'SUPABASE_WRITE_OK',
  'SUPABASE_WRITE_FAILED',
  'OUTBOX_CLAIMED',
  'OUTBOX_DELIVERED',
  'OUTBOX_DEADLETTERED',
  'OLLAMA_HEALTH_OK',
  'OLLAMA_HEALTH_FAILED',
  'MACOS_PERMISSION_MISSING',
  'SLEEP_OR_WAKE_OBSERVED',
  'RESTART_OBSERVED',
  'BREAK_GLASS_CONFIRMED_OFF',
  'DOCTOR_PASSED',
  'DOCTOR_FAILED',
  'SMOKE_PASSED',
  'SMOKE_FAILED',
] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const labEventSchema = z
  .object({
    host_id: z.string().min(1),
    host_role: z.enum(HOST_ROLES),
    runtime_version: z.string().optional(),
    event_kind: z.enum(EVENT_KINDS),
    component: z.string().optional(),
    severity: z.enum(SEVERITIES).optional(),
    status: z.string().optional(),
    observed_at: z.string().datetime({ offset: true }),
    duration_ms: z.number().int().min(0).optional(),
    evidence_json: z.record(z.string(), z.unknown()).default({}),
    next_action: z.string().nullable().optional(),
    secret_redacted: z.literal(true),
    correlation_id: z.string().nullable().optional(),
  })
  .strict()

export type LabEvent = z.infer<typeof labEventSchema>

export const labEventBatchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(100),
})
