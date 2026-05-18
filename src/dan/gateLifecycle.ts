import type {
  ExecutionWindow,
  GateRequest,
  PolicyDecision,
} from './contracts'

export function createScopeHash(input: {
  actorId: string
  action: string
  resource: string
}) {
  return `${input.actorId}:${input.action}:${input.resource}`
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createGateRequest(input: {
  actorId: string
  action: string
  resource: string
  decision: PolicyDecision
  now?: Date
}): GateRequest {
  const now = input.now ?? new Date()
  return {
    id: createId('gate'),
    actorId: input.actorId,
    action: input.action,
    resource: input.resource,
    scopeHash: createScopeHash(input),
    decision: input.decision,
    status: 'pending',
    createdAt: now.toISOString(),
  }
}

export function approveGateRequest(input: {
  gate: GateRequest
  approverActorId: string
  now?: Date
  ttlMs?: number
}) {
  if (input.gate.status !== 'pending') {
    throw new Error(`Gate ${input.gate.id} is not pending.`)
  }

  const now = input.now ?? new Date()
  const approvedGate: GateRequest = {
    ...input.gate,
    status: 'approved',
    resolvedAt: now.toISOString(),
    resolvedBy: input.approverActorId,
  }

  return {
    gate: approvedGate,
    executionWindow: createExecutionWindow({
      gate: approvedGate,
      now,
      ttlMs: input.ttlMs,
    }),
  }
}

export function denyGateRequest(input: {
  gate: GateRequest
  actorId: string
  now?: Date
}): GateRequest {
  if (input.gate.status !== 'pending') {
    throw new Error(`Gate ${input.gate.id} is not pending.`)
  }
  const now = input.now ?? new Date()
  return {
    ...input.gate,
    status: 'denied',
    resolvedAt: now.toISOString(),
    resolvedBy: input.actorId,
  }
}

export function ghostGateRequest(input: {
  gate: GateRequest
  actorId: string
  now?: Date
}): GateRequest {
  if (input.gate.status !== 'pending') {
    throw new Error(`Gate ${input.gate.id} is not pending.`)
  }
  const now = input.now ?? new Date()
  return {
    ...input.gate,
    status: 'ghosted',
    resolvedAt: now.toISOString(),
    resolvedBy: input.actorId,
  }
}

export function createExecutionWindow(input: {
  gate: GateRequest
  now?: Date
  ttlMs?: number
}): ExecutionWindow {
  if (input.gate.status !== 'approved') {
    throw new Error('Execution window requires an approved gate.')
  }

  const now = input.now ?? new Date()
  const ttlMs = input.ttlMs ?? 5 * 60 * 1000
  return {
    id: createId('window'),
    gateRequestId: input.gate.id,
    actorId: input.gate.actorId,
    action: input.gate.action,
    resource: input.gate.resource,
    scopeHash: input.gate.scopeHash,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    singleUse: true,
  }
}

export function consumeExecutionWindow(input: {
  executionWindow: ExecutionWindow
  actorId: string
  action: string
  resource: string
  scopeHash: string
  now?: Date
}): ExecutionWindow {
  const now = input.now ?? new Date()
  const window = input.executionWindow

  if (window.consumedAt) {
    throw new Error(`Execution window ${window.id} was already consumed.`)
  }

  if (new Date(window.expiresAt).getTime() < now.getTime()) {
    throw new Error(`Execution window ${window.id} is expired.`)
  }

  if (
    window.actorId !== input.actorId ||
    window.action !== input.action ||
    window.resource !== input.resource ||
    window.scopeHash !== input.scopeHash
  ) {
    throw new Error(`Execution window ${window.id} does not match this action.`)
  }

  return {
    ...window,
    consumedAt: now.toISOString(),
  }
}
