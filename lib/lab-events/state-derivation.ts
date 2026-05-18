import type { EventKind } from './types'

export interface CurrentStateUpdate {
  state?: 'declared' | 'observed' | 'stale' | 'degraded' | 'offline' | 'ghost'
  stability_state?: 'ok' | 'degraded' | 'offline' | 'stale' | null
  last_error?: string | null
  runtime_version?: string
}

// Pure function: given an event kind + severity + next_action, decide how the
// host's current_state should change on ingest. Stale / offline derivation is
// time-based and lives in a separate periodic job — not here.
export function deriveCurrentState(input: {
  event_kind: EventKind
  severity?: string
  next_action?: string | null
  runtime_version?: string
}): CurrentStateUpdate {
  const { event_kind, severity, next_action, runtime_version } = input
  const result: CurrentStateUpdate = {}
  if (runtime_version) result.runtime_version = runtime_version

  switch (event_kind) {
    case 'HEARTBEAT_EMITTED':
    case 'DOCTOR_PASSED':
    case 'SMOKE_PASSED':
      result.state = 'observed'
      return result

    case 'HEALTH_CHECK_PASSED':
      result.state = 'observed'
      result.stability_state = 'ok'
      result.last_error = null
      return result

    case 'HEALTH_CHECK_FAILED':
    case 'DOCTOR_FAILED':
    case 'SMOKE_FAILED':
      result.state = 'observed'
      result.stability_state = 'degraded'
      if (next_action) result.last_error = next_action
      return result

    case 'CLOUDFLARED_FAILED':
    case 'SUPABASE_WRITE_FAILED':
    case 'OLLAMA_HEALTH_FAILED':
    case 'MACOS_PERMISSION_MISSING':
      result.stability_state = 'degraded'
      if (next_action) result.last_error = next_action
      return result

    case 'BREAK_GLASS_CONFIRMED_OFF':
    case 'RESTART_OBSERVED':
    case 'SLEEP_OR_WAKE_OBSERVED':
    case 'PROCESS_STARTED':
    case 'PACKAGE_DOWNLOADED':
    case 'PACKAGE_VERIFIED':
    case 'PACKAGE_INSTALLED':
    case 'DOPPLER_CONFIG_RESOLVED':
    case 'LAUNCHD_PLIST_INSTALLED':
    case 'LAUNCHD_BOOTSTRAPPED':
    case 'CLOUDFLARED_CONNECTED':
    case 'SUPABASE_WRITE_OK':
    case 'OUTBOX_CLAIMED':
    case 'OUTBOX_DELIVERED':
    case 'OUTBOX_DEADLETTERED':
    case 'OLLAMA_HEALTH_OK':
      return result

    default: {
      // Exhaustive switch guard. If a new event kind lands without a case,
      // TypeScript yells here. Severity-based fallback below covers it at
      // runtime so we never silently drop state info.
      const _exhaustive: never = event_kind
      void _exhaustive
      if (severity === 'error' || severity === 'critical') {
        result.stability_state = 'degraded'
        if (next_action) result.last_error = next_action
      }
      return result
    }
  }
}
