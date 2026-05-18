export type DecisionKind = 'ok' | 'denied' | 'needs_approval' | 'ghost' | 'error'

export type ActorKind = 'human' | 'local_llm' | 'cloud_llm' | 'sdk_tool'

export type Capability =
  | 'classify'
  | 'propose'
  | 'summarize'
  | 'execute'
  | 'approve_gate'
  | 'mutate_repo'
  | 'mutate_provider'
  | 'access_secrets'
  | 'close_receipt'

export type EvidenceKind =
  | 'command'
  | 'stdout'
  | 'stderr'
  | 'exit_code'
  | 'diff'
  | 'test_result'
  | 'screenshot'
  | 'receipt'

export interface Client {
  id: string
  name: string
  policyProfile: string
  secretsProfile: string
}

export interface Project {
  id: string
  clientId: string
  name: string
  repo: string
}

export interface Actor {
  id: string
  kind: ActorKind
  roles: string[]
}

export interface PolicyRule {
  id: string
  effect: DecisionKind
  reason?: string
  actorKinds?: ActorKind[]
  actions?: string[]
  capabilities?: Capability[]
  requiredEvidence?: EvidenceKind[]
  unless?: {
    hasEvidence?: boolean
  }
}

export interface DanPolicy {
  $schema?: string
  version: 'dan.policy.v0'
  clients: Client[]
  projects: Project[]
  actors: Actor[]
  protectedActions: string[]
  rules: PolicyRule[]
}

export interface PolicyInput {
  actorId: string
  actorKind: ActorKind
  projectId: string
  action: string
  resource: string
  capability?: Capability
  evidenceIds?: string[]
}

export interface PolicyDecision {
  kind: DecisionKind
  ruleIds: string[]
  reason: string
  requiredEvidence?: EvidenceKind[]
}

export type GateStatus = 'pending' | 'approved' | 'denied' | 'ghosted'

export interface GateRequest {
  id: string
  actorId: string
  action: string
  resource: string
  scopeHash: string
  decision: PolicyDecision
  status: GateStatus
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface ExecutionWindow {
  id: string
  gateRequestId: string
  actorId: string
  action: string
  resource: string
  scopeHash: string
  expiresAt: string
  consumedAt?: string
  singleUse: true
}

export interface Evidence {
  id: string
  kind: EvidenceKind
  action: string
  resource: string
  producedAt: string
  summary: string
  data: Record<string, unknown>
}

export type ControlPlaneAction =
  | 'feature.create'
  | 'policy.create'
  | 'policy.retire'
  | 'gate.create'
  | 'gate.approve'
  | 'gate.deny'
  | 'gate.ghost'
  | 'probe.run'
  | 'evidence.attach'
  | 'receipt.close'

export type ActionRisk = 'low' | 'medium' | 'high'

export interface ControlPlaneActionDefinition {
  id: ControlPlaneAction
  label: string
  capability: Capability
  risk: ActionRisk
  requiresPolicyDecision: boolean
  requiresGate: boolean
  requiresEvidence: boolean
  creates: string[]
}

export interface GovernanceEvent {
  id: string
  kind:
    | 'ACTION_INVOKED'
    | 'POLICY_DECISION_RECORDED'
    | 'FEATURE_CANDIDATE_CREATED'
    | 'WORKORDER_DRAFT_CREATED'
    | 'GATE_REQUESTED'
    | 'GATE_APPROVED'
    | 'GATE_DENIED'
    | 'GATE_GHOSTED'
    | 'EXECUTION_WINDOW_CREATED'
    | 'EXECUTION_WINDOW_CONSUMED'
    | 'EXECUTION_BLOCKED'
    | 'EVIDENCE_CAPTURED'
    | 'RECEIPT_DRAFT_CREATED'
    | 'RECEIPT_CLOSED'
    | 'GHOST_RECORDED'
    | 'CONTROL_PLANE_READY'
  message: string
  createdAt: string
  actionId?: ControlPlaneAction
  objectId?: string
}

export interface FeatureCandidate {
  id: string
  title: string
  projectId: string
  actorId: string
  createdAt: string
  status: 'candidate' | 'promoted'
}

export type ReceiptStatus = 'open' | 'closed' | 'ghosted' | 'rejected'

export interface Receipt {
  id: string
  workorderId: string
  status: ReceiptStatus
  scopeClaimed: string
  evidence: Evidence[]
  proven: string[]
  notProven: string[]
  ghosts: string[]
  createdAt: string
  closedAt?: string
}

export interface EngineExecutionInput {
  actorId: string
  action: string
  resource: string
  scopeHash: string
  command?: string
  args?: string[]
}

export interface EngineExecutionResult {
  evidence: Evidence[]
  executionWindow: ExecutionWindow
}

export interface Engine {
  id: string
  name: string
  capabilities: Capability[]
  execute: (
    input: EngineExecutionInput,
    window?: ExecutionWindow
  ) => Promise<EngineExecutionResult>
}

export type WorkorderStatus =
  | 'candidate'
  | 'admitted'
  | 'gated'
  | 'approved'
  | 'running'
  | 'blocked'
  | 'evidence_captured'
  | 'closed'
  | 'ghosted'
  | 'rejected'

export interface Workorder {
  id: string
  title: string
  projectId: string
  actorId: string
  action: string
  resource: string
  status: WorkorderStatus
  receiptId?: string
  gateRequestId?: string
}
