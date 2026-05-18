import type {
  DanPolicy,
  DecisionKind,
  PolicyDecision,
  PolicyInput,
  PolicyRule,
} from './contracts'

const precedence: DecisionKind[] = [
  'denied',
  'ghost',
  'needs_approval',
  'error',
  'ok',
]

function ruleMatches(input: PolicyInput, rule: PolicyRule) {
  if (rule.actorKinds && !rule.actorKinds.includes(input.actorKind)) {
    return false
  }

  if (rule.actions && !rule.actions.includes(input.action)) {
    return false
  }

  if (
    rule.capabilities &&
    (!input.capability || !rule.capabilities.includes(input.capability))
  ) {
    return false
  }

  if (rule.unless?.hasEvidence && (input.evidenceIds?.length ?? 0) > 0) {
    return false
  }

  return Boolean(rule.actorKinds || rule.actions || rule.capabilities)
}

function decisionFromRule(rule: PolicyRule): PolicyDecision {
  return {
    kind: rule.effect,
    ruleIds: [rule.id],
    reason: rule.reason ?? `Policy rule ${rule.id} matched.`,
    requiredEvidence: rule.requiredEvidence,
  }
}

export function evaluatePolicy(
  input: PolicyInput,
  policy: DanPolicy
): PolicyDecision {
  const actor = policy.actors.find((candidate) => candidate.id === input.actorId)
  if (!actor) {
    return {
      kind: 'error',
      ruleIds: [],
      reason: `Unknown actor ${input.actorId}.`,
    }
  }

  const matching = policy.rules.filter((rule) => ruleMatches(input, rule))
  for (const kind of precedence) {
    const rule = matching.find((candidate) => candidate.effect === kind)
    if (rule) {
      return decisionFromRule(rule)
    }
  }

  if (policy.protectedActions.includes(input.action)) {
    return {
      kind: 'needs_approval',
      ruleIds: ['protected_action_default_gate'],
      reason: `Protected action ${input.action} requires an execution window.`,
    }
  }

  return {
    kind: 'ok',
    ruleIds: [],
    reason: 'No policy rule blocked or gated this action.',
  }
}
