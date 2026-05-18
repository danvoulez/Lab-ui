// Minimal PostgREST client targeted at minilab.database.
//
// Doctrine:
//   Doppler stores secret/config values.
//   This module reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
//   process.env, which is the canonical surface populated by
//   `doppler run --project=minilab --config=<env> -- <command>`.
//   Neither value is ever logged, returned, or fall-back-stored elsewhere.
//   NEXT_PUBLIC_* is NOT used: the service role key must never reach the
//   browser bundle.
//
// We deliberately do not pull in @supabase/supabase-js. Only three operations
// are needed and PostgREST handles them.

import type { CurrentStateUpdate } from './state-derivation'
import type { LabEvent } from './types'
import { getDopplerConfigMetadata } from '@/src/engines/dopplerConfigEngine'

export interface SupabaseEnv {
  url: string
  serviceRoleKey: string
  dopplerProject: string
  dopplerConfig: string
}

export class SupabaseEnvMissingError extends Error {
  constructor(missing: string[]) {
    super(
      [
        `Supabase environment is incomplete (missing: ${missing.join(', ')}).`,
        'Values must be supplied via Doppler. Run:',
        '  doppler run --project=minilab --config=<dev_local|lab8gb|...> -- pnpm dev',
        'No local-file fallback is honored for SUPABASE_SERVICE_ROLE_KEY.',
      ].join(' '),
    )
    this.name = 'SupabaseEnvMissingError'
  }
}

export function readSupabaseEnv(): SupabaseEnv {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing: string[] = []
  if (!url) missing.push('SUPABASE_URL')
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length || !url || !key) {
    throw new SupabaseEnvMissingError(missing)
  }
  const meta = getDopplerConfigMetadata({
    variablesKnown: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  })
  return {
    url,
    serviceRoleKey: key,
    dopplerProject: meta.project,
    dopplerConfig: meta.config,
  }
}

// Re-export so route handlers can return Doppler metadata in error bodies
// without ever leaking values.
export function describeDopplerSource() {
  return getDopplerConfigMetadata({
    variablesKnown: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  })
}

function headers(env: SupabaseEnv, profile: string, prefer?: string) {
  const h: Record<string, string> = {
    apikey: env.serviceRoleKey,
    Authorization: `Bearer ${env.serviceRoleKey}`,
    'Content-Type': 'application/json',
    'Accept-Profile': profile,
    'Content-Profile': profile,
  }
  if (prefer) h['Prefer'] = prefer
  return h
}

export async function listKnownHostIds(env: SupabaseEnv): Promise<string[]> {
  const res = await fetch(`${env.url}/rest/v1/hosts?select=host_id`, {
    headers: headers(env, 'lab_observability'),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Failed to list hosts (${res.status}): ${await res.text()}`)
  }
  const rows = (await res.json()) as { host_id: string }[]
  return rows.map((r) => r.host_id)
}

export interface InsertEventResult {
  id: string
  received_at: string
}

export async function insertEvent(
  env: SupabaseEnv,
  event: LabEvent,
): Promise<InsertEventResult> {
  const res = await fetch(`${env.url}/rest/v1/events`, {
    method: 'POST',
    headers: headers(env, 'lab_observability', 'return=representation'),
    body: JSON.stringify({
      host_id: event.host_id,
      host_role: event.host_role,
      runtime_version: event.runtime_version,
      event_kind: event.event_kind,
      component: event.component,
      severity: event.severity,
      status: event.status,
      observed_at: event.observed_at,
      duration_ms: event.duration_ms,
      evidence_json: event.evidence_json,
      next_action: event.next_action ?? null,
      secret_redacted: true,
    }),
  })
  if (!res.ok) {
    throw new Error(`Failed to insert event (${res.status}): ${await res.text()}`)
  }
  const rows = (await res.json()) as { id: string; received_at: string }[]
  if (!rows[0]) throw new Error('insert_event returned no row')
  return { id: rows[0].id, received_at: rows[0].received_at }
}

export async function upsertCurrentState(
  env: SupabaseEnv,
  host_id: string,
  last_event_id: string,
  observed_at: string,
  update: CurrentStateUpdate,
): Promise<void> {
  const body: Record<string, unknown> = {
    host_id,
    last_event_id,
    last_seen_at: observed_at,
    updated_at: new Date().toISOString(),
  }
  if (update.state !== undefined) body.state = update.state
  if (update.stability_state !== undefined)
    body.stability_state = update.stability_state
  if (update.runtime_version !== undefined)
    body.runtime_version = update.runtime_version
  if (update.last_error !== undefined) body.last_error = update.last_error

  const res = await fetch(`${env.url}/rest/v1/current_state`, {
    method: 'POST',
    headers: headers(env, 'lab_observability', 'resolution=merge-duplicates'),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(
      `Failed to upsert current_state (${res.status}): ${await res.text()}`,
    )
  }
}

export interface LabStateRow {
  host_id: string
  host_name: string | null
  host_role: 'supervisor' | 'inference' | 'workbench'
  host_status: string
  last_seen_at: string | null
  state: string | null
  stability_state: string | null
  runtime_version: string | null
  last_error: string | null
  last_event_id: string | null
  health_status: string | null
  launchd_status: string | null
  cloudflared_status: string | null
  break_glass_enabled: boolean | null
}

export async function listLabState(env: SupabaseEnv): Promise<LabStateRow[]> {
  const hostsRes = await fetch(
    `${env.url}/rest/v1/hosts?select=host_id,host_name,host_role,status&order=host_id`,
    { headers: headers(env, 'lab_observability'), cache: 'no-store' },
  )
  if (!hostsRes.ok) {
    throw new Error(`Failed to list hosts (${hostsRes.status}): ${await hostsRes.text()}`)
  }
  const hosts = (await hostsRes.json()) as {
    host_id: string
    host_name: string | null
    host_role: 'supervisor' | 'inference' | 'workbench'
    status: string
  }[]

  const stateRes = await fetch(
    `${env.url}/rest/v1/current_state?select=host_id,state,stability_state,last_seen_at,last_error,runtime_version,last_event_id,health_status,launchd_status,cloudflared_status,break_glass_enabled`,
    { headers: headers(env, 'lab_observability'), cache: 'no-store' },
  )
  if (!stateRes.ok) {
    throw new Error(
      `Failed to list current_state (${stateRes.status}): ${await stateRes.text()}`,
    )
  }
  const states = (await stateRes.json()) as Record<string, unknown>[]
  const byHost = new Map<string, Record<string, unknown>>()
  for (const row of states) byHost.set(String(row.host_id), row)

  return hosts.map((h) => {
    const s = byHost.get(h.host_id) ?? {}
    return {
      host_id: h.host_id,
      host_name: h.host_name,
      host_role: h.host_role,
      host_status: h.status,
      state: (s.state as string | null) ?? null,
      stability_state: (s.stability_state as string | null) ?? null,
      last_seen_at: (s.last_seen_at as string | null) ?? null,
      last_error: (s.last_error as string | null) ?? null,
      runtime_version: (s.runtime_version as string | null) ?? null,
      last_event_id: (s.last_event_id as string | null) ?? null,
      health_status: (s.health_status as string | null) ?? null,
      launchd_status: (s.launchd_status as string | null) ?? null,
      cloudflared_status: (s.cloudflared_status as string | null) ?? null,
      break_glass_enabled: (s.break_glass_enabled as boolean | null) ?? null,
    }
  })
}
