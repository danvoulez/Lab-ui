'use client'

import {
  ActivityIcon,
  BarChart3Icon,
  BadgeCheckIcon,
  BoxesIcon,
  BracesIcon,
  BrainCircuitIcon,
  CheckIcon,
  CircleSlashIcon,
  DatabaseIcon,
  FileCheckIcon,
  FileTextIcon,
  FlaskConicalIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  PlusIcon,
  PlayIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'
import { useEffect, useMemo, useState } from 'react'
import defaultPolicy from '@/src/dan/dan-policy.local.json'
import type {
  ControlPlaneAction,
  DanPolicy,
  Evidence,
  ExecutionWindow,
  FeatureCandidate,
  GateRequest,
  GovernanceEvent,
  PolicyDecision,
  Receipt,
  Workorder,
} from '@/src/dan/contracts'
import { attachEvidence, closeReceipt, createReceiptDraft } from '@/src/dan/receiptLifecycle'
import {
  approveGateRequest,
  createGateRequest,
  createScopeHash,
  denyGateRequest,
  ghostGateRequest,
} from '@/src/dan/gateLifecycle'
import { engineRegistry } from '@/src/engines/engineRegistry'
import { evaluatePolicy } from '@/src/dan/evaluatePolicy'
import { getControlPlaneAction } from '@/src/dan/actionRegistry'
import { getDopplerConfigMetadata } from '@/src/engines/dopplerConfigEngine'
import { getPolicyValidationResult } from '@/src/dan/validatePolicy'
import { characterLinks, findCharacter } from '@/src/dan/minilabUniverse'
import { minilabUniverseSeed } from '@/src/dan/minilabUniverseSeed'
import type { Character, CharacterFamily, CharacterLink } from '@/src/dan/minilabUniverse'
import { loadJson, saveJson } from './persistence'

type Tab =
  | 'workorders'
  | 'characters'
  | 'candidates'
  | 'gates'
  | 'receipts'
  | 'policies'
  | 'actors'
  | 'engines'
  | 'environments'
  | 'secrets'
  | 'limits'
  | 'repositories'
  | 'memory'
  | 'local-llm-findings'
  | 'clients'
  | 'analytics'
  | 'settings'

type PreviewMode = 'consequence' | 'trace' | 'character' | 'receipt' | 'json'

const storageKey = 'dan-control-plane-v0'
const demoResource = 'control-plane-demo-safe-node-command'
const demoActorId = 'actor_vercel_sandbox'
const demoAction = 'shell.risky_command'

const tabCopy: Record<Tab, { title: string; description: string }> = {
  clients: {
    title: 'Clients workbench',
    description: 'Choose the business boundary, policy profile, and secrets metadata for this control plane.',
  },
  candidates: {
    title: 'Candidates workbench',
    description: 'Ingress material becomes candidates before any gate, execution, or receipt can exist.',
  },
  gates: {
    title: 'Gates workbench',
    description: 'Request, approve, deny, ghost, and consume scoped execution windows.',
  },
  policies: {
    title: 'Policy workbench',
    description: 'Edit Dan JSON, validate the schema, and preview admission decisions.',
  },
  engines: {
    title: 'Engine workbench',
    description: 'Inspect SDK machinery and the capabilities each engine exposes behind gates.',
  },
  workorders: {
    title: 'Workorders workbench',
    description: 'Track candidate work through gated, approved, running, evidenced, and closed states.',
  },
  characters: {
    title: 'Characters workbench',
    description: 'Map the Minilab universe before operating gates, engines, and receipts.',
  },
  receipts: {
    title: 'Receipts workbench',
    description: 'Close only what has evidence; ghost anything that cannot honestly close.',
  },
  actors: {
    title: 'Actors workbench',
    description: 'Inspect who may propose, approve, execute, or close under Dan JSON.',
  },
  environments: {
    title: 'Environments workbench',
    description: 'Execution environments are resources with capabilities, not authority.',
  },
  secrets: {
    title: 'Secrets workbench',
    description: 'Show secrets metadata and scopes without rendering secret values.',
  },
  limits: {
    title: 'Limits workbench',
    description: 'Budget and autonomy controls become policy inputs, not prompt wishes.',
  },
  repositories: {
    title: 'Repositories workbench',
    description: 'Repositories are project resources that must be admitted before mutation.',
  },
  memory: {
    title: 'Memory workbench',
    description: 'Memory stores receipts, ghosts, and evidence projections, not unchecked truth.',
  },
  'local-llm-findings': {
    title: 'Local LLM findings',
    description: 'Local models may classify and propose; they never execute or close receipts.',
  },
  analytics: {
    title: 'Analytics workbench',
    description: 'Measure gates, ghosts, evidence, receipts, and engine usage.',
  },
  settings: {
    title: 'Settings workbench',
    description: 'Settings expose control law and setup surfaces, not hidden prompt rules.',
  },
}

const navGroups: Array<{
  label: string
  items: Array<{
    id: Tab
    label: string
    icon: React.ComponentType<{ className?: string }>
    badge?: string
  }>
}> = [
  {
    label: 'Dan Local / Active Client',
    items: [
      { id: 'characters', label: 'Characters', icon: BoxesIcon },
      { id: 'workorders', label: 'Workorders', icon: ActivityIcon },
      { id: 'candidates', label: 'Candidates', icon: FileTextIcon },
      { id: 'gates', label: 'Gates', icon: KeyRoundIcon },
      { id: 'receipts', label: 'Receipts', icon: FileCheckIcon },
    ],
  },
  {
    label: 'Control',
    items: [
      { id: 'policies', label: 'Policies', icon: BracesIcon },
      { id: 'actors', label: 'Actors', icon: UserRoundIcon },
      { id: 'engines', label: 'Engines', icon: FlaskConicalIcon },
      { id: 'environments', label: 'Environments', icon: BoxesIcon },
      { id: 'secrets', label: 'Secrets', icon: LockKeyholeIcon },
      { id: 'limits', label: 'Limits', icon: SlidersHorizontalIcon },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { id: 'repositories', label: 'Repositories', icon: DatabaseIcon },
      { id: 'memory', label: 'Memory', icon: ScrollTextIcon },
      { id: 'local-llm-findings', label: 'Local LLM Findings', icon: BrainCircuitIcon },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'clients', label: 'Clients', icon: BoxesIcon },
      { id: 'analytics', label: 'Analytics', icon: BarChart3Icon },
      { id: 'settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

interface PersistedState {
  policyText: string
  candidates: FeatureCandidate[]
  gates: GateRequest[]
  windows: ExecutionWindow[]
  workorders: Workorder[]
  receipts: Receipt[]
  events: GovernanceEvent[]
  lastError?: string
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

function createEvent(input: {
  kind: GovernanceEvent['kind']
  message: string
  actionId?: ControlPlaneAction
  objectId?: string
}) {
  return {
    id: createId('event'),
    kind: input.kind,
    message: input.message,
    createdAt: new Date().toISOString(),
    actionId: input.actionId,
    objectId: input.objectId,
  }
}

function initialState(): PersistedState {
  return {
    policyText: JSON.stringify(defaultPolicy, null, 2),
    candidates: [],
    gates: [],
    windows: [],
    workorders: [
      {
        id: 'workorder_demo',
        title: 'Protected command proof',
        projectId: 'project_control_plane',
        actorId: demoActorId,
        action: demoAction,
        resource: demoResource,
        status: 'candidate',
      },
    ],
    receipts: [],
    events: [
      createEvent({
        kind: 'CONTROL_PLANE_READY',
        message: 'v0 initialized',
      }),
    ],
  }
}

function parsePolicy(text: string): { policy?: DanPolicy; error?: string } {
  try {
    const parsed = JSON.parse(text) as unknown
    const validation = getPolicyValidationResult(parsed)
    if (!validation.ok) {
      return {
        error:
          validation.errors
            ?.map((item) => `${item.instancePath || '/'} ${item.message}`)
            .join('; ') ?? 'Invalid Dan policy.',
      }
    }
    return { policy: parsed as DanPolicy }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid JSON.',
    }
  }
}

function replaceById<T extends { id: string }>(items: T[], next: T) {
  return items.map((item) => (item.id === next.id ? next : item))
}

function normalizePersistedState(state: PersistedState): PersistedState {
  return {
    ...initialState(),
    ...state,
    candidates: state.candidates ?? [],
    events: (state.events ?? []).map((event) => {
      if (typeof event === 'string') {
        return createEvent({
          kind: 'CONTROL_PLANE_READY',
          message: event,
        })
      }
      return event
    }),
  }
}

export function ControlPlane() {
  const [tab, setTab] = useState<Tab>('characters')
  const [state, setState] = useState<PersistedState>(() => initialState())
  const [hydrated, setHydrated] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('consequence')
  const [selectedCharacterId, setSelectedCharacterId] = useState('lab_256')

  useEffect(() => {
    setState(normalizePersistedState(loadJson(window.localStorage, storageKey, initialState())))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) {
      saveJson(window.localStorage, storageKey, state)
    }
  }, [hydrated, state])

  const { policy, error: policyError } = useMemo(
    () => parsePolicy(state.policyText),
    [state.policyText]
  )

  const decisionPreview = useMemo<PolicyDecision | null>(() => {
    if (!policy) {
      return null
    }
    return evaluatePolicy(
      {
        actorId: demoActorId,
        actorKind: 'sdk_tool',
        projectId: 'project_control_plane',
        action: demoAction,
        resource: demoResource,
        capability: 'execute',
      },
      policy
    )
  }, [policy])

  const activeClient = policy?.clients[0]
  const activeProject = policy?.projects[0]
  const selectedCharacter =
    findCharacter(minilabUniverseSeed, selectedCharacterId) ??
    findCharacter(minilabUniverseSeed, 'lab_256')
  const selectedCharacterLinks = selectedCharacter
    ? characterLinks(minilabUniverseSeed, selectedCharacter.id)
    : []
  const doppler = getDopplerConfigMetadata({
    project: activeClient?.secretsProfile ?? 'doppler_local',
    config: 'dev',
    variablesKnown: ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'],
  })

  const appendEvent = (event: GovernanceEvent) => {
    setState((current) => ({
      ...current,
      events: [event, ...current.events].slice(0, 40),
    }))
  }

  const evaluateActionPolicy = (
    actionId: ControlPlaneAction,
    evidenceIds?: string[]
  ): PolicyDecision | null => {
    if (!policy) {
      return null
    }
    const action = getControlPlaneAction(actionId)
    return evaluatePolicy(
      {
        actorId: 'actor_dan',
        actorKind: 'human',
        projectId: 'project_control_plane',
        action: actionId,
        resource: 'control-plane-ui',
        capability: action.capability,
        evidenceIds,
      },
      policy
    )
  }

  const createPolicyDecisionEvent = (
    actionId: ControlPlaneAction,
    decision: PolicyDecision | null
  ) =>
    createEvent({
      kind: 'POLICY_DECISION_RECORDED',
      message: decision
        ? `${decision.kind}: ${decision.reason}`
        : 'error: policy unavailable',
      actionId,
    })

  const createFeatureDraft = () => {
    const candidate: FeatureCandidate = {
      id: createId('candidate'),
      title: `New governed feature ${state.candidates.length + 1}`,
      projectId: 'project_control_plane',
      actorId: 'actor_dan',
      createdAt: new Date().toISOString(),
      status: 'promoted',
    }
    const workorder: Workorder = {
      id: createId('workorder'),
      title: candidate.title,
      projectId: candidate.projectId,
      actorId: candidate.actorId,
      action: 'feature.create',
      resource: candidate.id,
      status: 'candidate',
    }
    setState((current) => ({
      ...current,
      candidates: [candidate, ...current.candidates],
      workorders: [workorder, ...current.workorders],
      events: [
        createEvent({
          kind: 'FEATURE_CANDIDATE_CREATED',
          message: candidate.title,
          actionId: 'feature.create',
          objectId: candidate.id,
        }),
        createEvent({
          kind: 'WORKORDER_DRAFT_CREATED',
          message: workorder.id,
          actionId: 'feature.create',
          objectId: workorder.id,
        }),
        ...current.events,
      ].slice(0, 40),
      lastError: undefined,
    }))
    setTab('workorders')
  }

  const startProtectedAttempt = (actionId: ControlPlaneAction = 'gate.create') => {
    if (!policy) {
      return
    }
    const actionDefinition = getControlPlaneAction(actionId)
    const decision = evaluatePolicy(
      {
        actorId: demoActorId,
        actorKind: 'sdk_tool',
        projectId: 'project_control_plane',
        action: demoAction,
        resource: demoResource,
        capability: 'execute',
      },
      policy
    )

    const workorder =
      state.workorders.find((item) => item.id === 'workorder_demo') ??
      state.workorders[0]
    if (decision.kind === 'needs_approval') {
      const gate = createGateRequest({
        actorId: demoActorId,
        action: demoAction,
        resource: demoResource,
        decision,
      })
      setState((current) => ({
        ...current,
        gates: [gate, ...current.gates],
        workorders: replaceById(current.workorders, {
          ...workorder,
          status: 'gated',
          gateRequestId: gate.id,
        }),
        events: [
          createEvent({
            kind: 'ACTION_INVOKED',
            message: actionDefinition.label,
            actionId,
          }),
          createEvent({
            kind: 'POLICY_DECISION_RECORDED',
            message: `${decision.kind}: ${decision.reason}`,
            actionId,
          }),
          createEvent({
            kind: 'GATE_REQUESTED',
            message: `${gate.id} ${decision.reason}`,
            actionId,
            objectId: gate.id,
          }),
          ...current.events,
        ].slice(0, 40),
        lastError: undefined,
      }))
      setTab('gates')
      return
    }

    if (decision.kind === 'denied' || decision.kind === 'ghost') {
      setState((current) => ({
        ...current,
        workorders: replaceById(current.workorders, {
          ...workorder,
          status: decision.kind === 'ghost' ? 'ghosted' : 'rejected',
        }),
        events: [
          createEvent({
            kind: 'POLICY_DECISION_RECORDED',
            message: `${decision.kind}: ${decision.reason}`,
            actionId,
          }),
          ...current.events,
        ],
      }))
    }
  }

  const approveGate = (gate: GateRequest) => {
    const actionId = 'gate.approve'
    const actionDecision = evaluateActionPolicy(actionId)
    const { gate: approved, executionWindow } = approveGateRequest({
      gate,
      approverActorId: 'actor_dan',
    })
    setState((current) => ({
      ...current,
      gates: replaceById(current.gates, approved),
      windows: [executionWindow, ...current.windows],
      workorders: current.workorders.map((item) =>
        item.gateRequestId === gate.id ? { ...item, status: 'approved' } : item
      ),
      events: [
        createEvent({
          kind: 'ACTION_INVOKED',
          message: getControlPlaneAction(actionId).label,
          actionId,
          objectId: gate.id,
        }),
        createPolicyDecisionEvent(actionId, actionDecision),
        createEvent({
          kind: 'GATE_APPROVED',
          message: `${gate.id} by actor_dan`,
          actionId,
          objectId: gate.id,
        }),
        createEvent({
          kind: 'EXECUTION_WINDOW_CREATED',
          message: executionWindow.id,
          actionId,
          objectId: executionWindow.id,
        }),
        ...current.events,
      ],
      lastError: undefined,
    }))
  }

  const denyGate = (gate: GateRequest) => {
    const actionId = 'gate.deny'
    const actionDecision = evaluateActionPolicy(actionId)
    const denied = denyGateRequest({ gate, actorId: 'actor_dan' })
    setState((current) => ({
      ...current,
      gates: replaceById(current.gates, denied),
      workorders: current.workorders.map((item) =>
        item.gateRequestId === gate.id ? { ...item, status: 'rejected' } : item
      ),
      events: [
        createEvent({
          kind: 'ACTION_INVOKED',
          message: getControlPlaneAction(actionId).label,
          actionId,
          objectId: gate.id,
        }),
        createPolicyDecisionEvent(actionId, actionDecision),
        createEvent({
          kind: 'GATE_DENIED',
          message: `${gate.id} by actor_dan`,
          actionId,
          objectId: gate.id,
        }),
        ...current.events,
      ],
    }))
  }

  const ghostGate = (gate: GateRequest) => {
    const actionId = 'gate.ghost'
    const actionDecision = evaluateActionPolicy(actionId)
    const ghosted = ghostGateRequest({ gate, actorId: 'actor_dan' })
    setState((current) => ({
      ...current,
      gates: replaceById(current.gates, ghosted),
      workorders: current.workorders.map((item) =>
        item.gateRequestId === gate.id ? { ...item, status: 'ghosted' } : item
      ),
      events: [
        createEvent({
          kind: 'ACTION_INVOKED',
          message: getControlPlaneAction(actionId).label,
          actionId,
          objectId: gate.id,
        }),
        createPolicyDecisionEvent(actionId, actionDecision),
        createEvent({
          kind: 'GATE_GHOSTED',
          message: `${gate.id} by actor_dan`,
          actionId,
          objectId: gate.id,
        }),
        createEvent({
          kind: 'GHOST_RECORDED',
          message: `gate ${gate.id} ghosted`,
          actionId,
          objectId: gate.id,
        }),
        ...current.events,
      ],
    }))
  }

  const executeApprovedWindow = async (window: ExecutionWindow) => {
    const workorder = state.workorders.find(
      (item) => item.gateRequestId === window.gateRequestId
    )
    if (workorder) {
      setState((current) => ({
        ...current,
        workorders: replaceById(current.workorders, {
          ...workorder,
          status: 'running',
        }),
        events: [
          createEvent({
            kind: 'ACTION_INVOKED',
            message: getControlPlaneAction('probe.run').label,
            actionId: 'probe.run',
            objectId: window.id,
          }),
          ...current.events,
        ].slice(0, 40),
      }))
    }

    const response = await fetch('/api/control-plane/local-shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executionWindow: window }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setState((current) => ({
        ...current,
        lastError: payload.error ?? 'Execution failed.',
        events: [
          createEvent({
            kind: 'EXECUTION_BLOCKED',
            message: payload.error ?? 'unknown error',
            actionId: 'probe.run',
            objectId: window.id,
          }),
          ...current.events,
        ],
      }))
      return
    }

    const evidence = payload.evidence as Evidence[]
    const consumedWindow = payload.executionWindow as ExecutionWindow
    const receiptDraft = createReceiptDraft({
      workorderId: workorder?.id ?? 'workorder_demo',
      scopeClaimed: 'Protected command executed once after scoped approval.',
    })
    const receipt = attachEvidence({ receipt: receiptDraft, evidence })

    setState((current) => ({
      ...current,
      windows: replaceById(current.windows, consumedWindow),
      receipts: [receipt, ...current.receipts],
      workorders: current.workorders.map((item) =>
        item.id === receipt.workorderId
          ? { ...item, status: 'evidence_captured', receiptId: receipt.id }
          : item
      ),
      events: [
        createEvent({
          kind: 'EXECUTION_WINDOW_CONSUMED',
          message: consumedWindow.id,
          actionId: 'probe.run',
          objectId: consumedWindow.id,
        }),
        createEvent({
          kind: 'EVIDENCE_CAPTURED',
          message: `${evidence.length} evidence item(s)`,
          actionId: 'probe.run',
          objectId: receipt.id,
        }),
        createEvent({
          kind: 'RECEIPT_DRAFT_CREATED',
          message: receipt.id,
          actionId: 'probe.run',
          objectId: receipt.id,
        }),
        ...current.events,
      ],
      lastError: undefined,
    }))
  }

  const closeWithEvidence = (receipt: Receipt) => {
    const actionId = 'receipt.close'
    const actionDecision = evaluateActionPolicy(
      actionId,
      receipt.evidence.map((item) => item.id)
    )
    const closed = closeReceipt({
      receipt,
      proven: ['A protected command executed only after approval.'],
      notProven: ['Production behavior is not proven in v0.'],
      evidenceIds: receipt.evidence.map((item) => item.id),
    })
    setState((current) => ({
      ...current,
      receipts: replaceById(current.receipts, closed),
      workorders: current.workorders.map((item) =>
        item.receiptId === receipt.id ? { ...item, status: 'closed' } : item
      ),
      events: [
        createEvent({
          kind: 'ACTION_INVOKED',
          message: getControlPlaneAction(actionId).label,
          actionId,
          objectId: receipt.id,
        }),
        createPolicyDecisionEvent(actionId, actionDecision),
        createEvent({
          kind: 'RECEIPT_CLOSED',
          message: `${receipt.id} with evidence`,
          actionId,
          objectId: receipt.id,
        }),
        ...current.events,
      ],
    }))
  }

  const createGhostReceipt = () => {
    const actionId = 'receipt.close'
    const actionDecision = evaluateActionPolicy(actionId, [])
    const draft = createReceiptDraft({
      workorderId: 'workorder_empty_receipt_probe',
      scopeClaimed: 'Attempt to close receipt without evidence.',
    })
    const ghosted = closeReceipt({
      receipt: draft,
      proven: [],
      notProven: ['No evidence was attached.'],
      evidenceIds: [],
    })
    setState((current) => ({
      ...current,
      receipts: [ghosted, ...current.receipts],
      events: [
        createEvent({
          kind: 'ACTION_INVOKED',
          message: 'Probe receipt closure without evidence',
          actionId,
          objectId: ghosted.id,
        }),
        createPolicyDecisionEvent(actionId, actionDecision),
        createEvent({
          kind: 'GHOST_RECORDED',
          message: 'receipt closure attempted without evidence',
          actionId,
          objectId: ghosted.id,
        }),
        ...current.events,
      ],
    }))
  }

  const resetDemo = () => {
    setState(initialState())
  }

  const invokeAction = (
    actionId: ControlPlaneAction,
    payload?: { gate?: GateRequest; receipt?: Receipt; window?: ExecutionWindow }
  ) => {
    switch (actionId) {
      case 'feature.create':
        createFeatureDraft()
        return
      case 'policy.create':
        {
          const actionDecision = evaluateActionPolicy(actionId)
          appendEvent(createPolicyDecisionEvent(actionId, actionDecision))
        }
        appendEvent(
          createEvent({
            kind: 'ACTION_INVOKED',
            message: getControlPlaneAction(actionId).label,
            actionId,
          })
        )
        setTab('policies')
        return
      case 'gate.create':
        startProtectedAttempt(actionId)
        return
      case 'gate.approve':
        if (payload?.gate) approveGate(payload.gate)
        return
      case 'gate.deny':
        if (payload?.gate) denyGate(payload.gate)
        return
      case 'gate.ghost':
        if (payload?.gate) ghostGate(payload.gate)
        return
      case 'probe.run':
        if (payload?.window) executeApprovedWindow(payload.window)
        else startProtectedAttempt(actionId)
        return
      case 'evidence.attach':
        appendEvent(
          createEvent({
            kind: 'ACTION_INVOKED',
            message: getControlPlaneAction(actionId).label,
            actionId,
          })
        )
        setTab('receipts')
        return
      case 'receipt.close':
        if (payload?.receipt) closeWithEvidence(payload.receipt)
        else setTab('receipts')
        return
      case 'policy.retire':
        appendEvent(
          createEvent({
            kind: 'ACTION_INVOKED',
            message: 'Policy retirement is gated out of v0',
            actionId,
          })
        )
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[#101010] text-neutral-100">
      <PanelGroup
        autoSaveId="dan-control-plane-shell"
        className="h-full"
        direction="horizontal"
      >
        <ResizablePanel defaultSize={22} minSize={16} maxSize={34}>
          <aside className="h-full overflow-y-auto overflow-x-hidden border-r border-white/10 bg-[#171717] p-3">
          <PlaneLabel>Plane 1 · Authority menu</PlaneLabel>
          <div className="mb-6 flex items-center gap-2 px-2">
            <ShieldIcon className="h-5 w-5 text-blue-400" />
            <div>
              <div className="text-sm font-semibold">Dan Control Plane</div>
              <div className="text-xs text-neutral-500">v0 local-first kernel</div>
            </div>
          </div>
          <div className="mb-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase text-neutral-500">Active authority</div>
            <div className="mt-1 text-sm font-medium">
              {activeClient?.name ?? 'No client'}
            </div>
            <div className="text-xs text-neutral-400">
              {activeProject?.name ?? 'No project'}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Policy: {activeClient?.policyProfile ?? 'missing'}
            </div>
          </div>
          <button
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 hover:bg-white/10"
            onClick={() => setPaletteOpen((open) => !open)}
            type="button"
          >
            <PlusIcon className="h-4 w-4" />
            New
          </button>
          {paletteOpen && (
            <div className="mb-4 rounded-lg border border-white/10 bg-black/30 p-2">
              {[
                ['New Feature', () => invokeAction('feature.create')],
                ['New Workorder', () => setTab('workorders')],
                ['Add Policy', () => invokeAction('policy.create')],
                ['Create Gate', () => invokeAction('gate.create')],
                ['Register Engine', () => setTab('engines')],
              ].map(([label, action]) => (
                <button
                  key={label as string}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/10"
                  onClick={() => {
                    ;(action as () => void)()
                    setPaletteOpen(false)
                  }}
                  type="button"
                >
                  {label as string}
                </button>
              ))}
            </div>
          )}
          <nav className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="mb-1 px-2 text-xs font-medium text-neutral-500">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map(({ id, icon: Icon, label, badge }) => (
                    <button
                      key={id}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                        tab === id
                          ? 'border border-blue-500/80 bg-white/8 text-white'
                          : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100'
                      }`}
                      onClick={() => setTab(id)}
                      type="button"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {badge ? (
                        <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-300">
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-8 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-neutral-400">
            <div className="mb-2 font-medium text-neutral-200">Operating contract</div>
            Dan JSON decides. Gates scope permission. SDKs perform machinery.
            Evidence becomes receipt.
          </div>
          </aside>
        </ResizablePanel>

        <ShellResizeHandle />

        <ResizablePanel defaultSize={49} minSize={34}>
          <main className="h-full min-w-0 overflow-y-auto overflow-x-hidden p-6">
            <PlaneLabel>Plane 2 · Clicked object detail</PlaneLabel>
            <Header
              tab={tab}
              policyError={policyError}
              onAction={invokeAction}
              onReset={resetDemo}
            />
            <UniverseHeader />
            {tab === 'characters' && (
              <CharactersPanel
                links={minilabUniverseSeed.links}
                onSelect={(characterId) => {
                  setSelectedCharacterId(characterId)
                  setPreviewMode('character')
                }}
                selectedCharacterId={selectedCharacter?.id ?? 'lab_256'}
                characters={minilabUniverseSeed.characters}
              />
            )}
            {tab === 'clients' && (
              <ClientsPanel client={activeClient} project={activeProject} doppler={doppler} />
            )}
            {tab === 'candidates' && (
              <CandidatesPanel
                candidates={state.candidates}
                onAction={invokeAction}
              />
            )}
            {tab === 'gates' && (
              <GatesPanel
                gates={state.gates}
                windows={state.windows}
                onAction={invokeAction}
              />
            )}
            {tab === 'policies' && (
              <PoliciesPanel
                policyText={state.policyText}
                policyError={policyError}
                decisionPreview={decisionPreview}
                onChange={(policyText) =>
                  setState((current) => ({ ...current, policyText }))
                }
              />
            )}
            {tab === 'engines' && <EnginesPanel doppler={doppler} />}
            {tab === 'workorders' && (
              <WorkordersPanel
                workorders={state.workorders}
                onAction={invokeAction}
              />
            )}
            {tab === 'receipts' && (
              <ReceiptsPanel
                receipts={state.receipts}
                onAction={invokeAction}
                onGhostProbe={createGhostReceipt}
              />
            )}
            {tab === 'actors' && <ActorsPanel policy={policy} />}
            {tab === 'environments' && (
              <StubWorkbench
                title="Execution environments"
                text="v0 has local shell and Vercel Sandbox adapters. Real LAB identity and heartbeats are a future gate."
                actionId="probe.run"
                onAction={invokeAction}
              />
            )}
            {tab === 'secrets' && (
              <StubWorkbench
                title="Secrets metadata"
                text={`Doppler profile ${doppler.project}/${doppler.config} is visible, but secret values are never rendered.`}
                actionId="evidence.attach"
                onAction={invokeAction}
              />
            )}
            {tab === 'limits' && (
              <StubWorkbench
                title="Limits"
                text="Limits will become policy inputs for autonomy, budgets, batch size, and execution windows."
                actionId="policy.create"
                onAction={invokeAction}
              />
            )}
            {tab === 'repositories' && (
              <StubWorkbench
                title="Repositories"
                text="Repos are project resources. Mutations require policy admission and a scoped gate."
                actionId="gate.create"
                onAction={invokeAction}
              />
            )}
            {tab === 'memory' && (
              <StubWorkbench
                title="Memory"
                text="Memory is receipt and ghost projection. It is not unchecked truth."
                actionId="receipt.close"
                onAction={invokeAction}
              />
            )}
            {tab === 'local-llm-findings' && (
              <StubWorkbench
                title="Local LLM findings"
                text="Local LLMs can propose candidates and summarize drift. The policy evaluator denies execution."
                actionId="policy.create"
                onAction={invokeAction}
              />
            )}
            {tab === 'analytics' && (
              <AnalyticsPanel
                gates={state.gates.length}
                receipts={state.receipts.length}
                ghosts={state.receipts.filter((receipt) => receipt.status === 'ghosted').length}
                events={state.events.length}
              />
            )}
            {tab === 'settings' && (
              <StubWorkbench
                title="Settings"
                text="Settings are control law surfaces: policies, engines, secrets, environments, and limits."
                actionId="policy.create"
                onAction={invokeAction}
              />
            )}
          </main>
        </ResizablePanel>

        <ShellResizeHandle />

        <ResizablePanel defaultSize={29} minSize={22} maxSize={44}>
          <UniversalPreviewPlane
            decision={decisionPreview}
            events={state.events}
            gates={state.gates}
            lastError={state.lastError}
            mode={previewMode}
            onModeChange={setPreviewMode}
            policyText={state.policyText}
            receipts={state.receipts}
            selectedCharacter={selectedCharacter}
            selectedCharacterLinks={selectedCharacterLinks}
            windows={state.windows}
          />
        </ResizablePanel>
      </PanelGroup>
    </div>
  )
}

function ShellResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-2 bg-[#101010] outline-none">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 group-hover:bg-blue-500/70 group-data-[resize-handle-active]:bg-blue-500" />
    </PanelResizeHandle>
  )
}

function PlaneLabel(props: { children: React.ReactNode }) {
  return (
    <div className="mb-3 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-600">
      {props.children}
    </div>
  )
}

function Header(props: {
  tab: Tab
  policyError?: string
  onAction: (actionId: ControlPlaneAction) => void
  onReset: () => void
}) {
  const copy = tabCopy[props.tab]
  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{copy.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">
            {copy.description}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500">
            One protected action can be requested, gated, approved, executed
            once, evidenced, and receipted.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            {props.policyError ? (
              <span className="rounded-full bg-red-500/10 px-2 py-1 text-red-200">
                Policy invalid
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-200">
                Policy valid
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5"
            onClick={props.onReset}
            type="button"
          >
            Reset local demo
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-50"
            disabled={Boolean(props.policyError)}
            onClick={() => props.onAction('probe.run')}
            type="button"
          >
            <PlayIcon className="h-4 w-4" />
            Run protected-command proof
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 rounded-lg border border-white/10 bg-[#1c1c1c] p-2">
        <BeltAction actionId="feature.create" onClick={props.onAction} />
        <BeltAction actionId="policy.create" onClick={props.onAction} />
        <BeltAction actionId="gate.create" onClick={props.onAction} />
        <BeltAction actionId="probe.run" onClick={props.onAction} />
        <BeltAction actionId="evidence.attach" onClick={props.onAction} />
        <BeltAction actionId="receipt.close" onClick={props.onAction} />
      </div>
    </div>
  )
}

function BeltAction(props: {
  actionId: ControlPlaneAction
  disabled?: boolean
  onClick: (actionId: ControlPlaneAction) => void
}) {
  const action = getControlPlaneAction(props.actionId)
  return (
    <button
      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={props.disabled}
      onClick={() => props.onClick(props.actionId)}
      title={`${action.id} · ${action.risk} risk`}
      type="button"
    >
      {action.label}
    </button>
  )
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#1c1c1c]">
      <div className="border-b border-white/10 px-4 py-3 text-sm font-medium">
        {props.title}
      </div>
      <div className="p-4">{props.children}</div>
    </div>
  )
}

function UniverseHeader() {
  return (
    <div className="mb-6 rounded-lg border border-white/10 bg-[#1c1c1c] p-3">
      <div className="grid gap-2 md:grid-cols-4">
        <UniverseCard label="Universe" value="minilab.work" />
        <UniverseCard label="Product" value="LogLine Automation" />
        <UniverseCard label="In control" value="Dan Local" />
        <UniverseCard label="Current place" value="LAB-256 · workbench" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {[
          'LogLine grammar',
          'Tower power',
          'LAB execution',
          'Supabase acts',
          'Doppler material',
        ].map((item) => (
          <span
            key={item}
            className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-neutral-300"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function UniverseCard(props: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-black/20 p-3">
      <div className="break-words text-[10px] uppercase text-neutral-500">
        {props.label}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-neutral-100">
        {props.value}
      </div>
    </div>
  )
}

const familyLabels: Record<CharacterFamily, string> = {
  logline: 'LogLine',
  dan: 'Dan',
  minilab: 'Minilab',
  authority: 'Authority',
  lab: 'LABs',
  agent: 'Agents',
  store: 'Stores',
  edge: 'Edge',
  engine: 'Engines',
  work: 'Work',
  proof: 'Proof',
}

const familyOrder: CharacterFamily[] = [
  'logline',
  'dan',
  'minilab',
  'authority',
  'lab',
  'agent',
  'store',
  'edge',
  'proof',
  'engine',
  'work',
]

function CharactersPanel(props: {
  characters: Character[]
  links: CharacterLink[]
  selectedCharacterId: string
  onSelect: (characterId: string) => void
}) {
  return (
    <div className="space-y-4">
      {familyOrder.map((family) => {
        const characters = props.characters.filter(
          (character) => character.family === family
        )
        if (characters.length === 0) {
          return null
        }

        return (
          <Panel key={family} title={familyLabels[family]}>
            <div className="grid gap-3 xl:grid-cols-2">
              {characters.map((character) => (
                <CharacterCard
                  character={character}
                  key={character.id}
                  linkCount={
                    props.links.filter(
                      (link) => link.from === character.id || link.to === character.id
                    ).length
                  }
                  onSelect={() => props.onSelect(character.id)}
                  selected={props.selectedCharacterId === character.id}
                />
              ))}
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

function CharacterCard(props: {
  character: Character
  linkCount: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`min-w-0 rounded-md border p-3 text-left transition ${
        props.selected
          ? 'border-blue-500/80 bg-blue-500/10'
          : 'border-white/10 bg-black/20 hover:bg-white/[0.04]'
      }`}
      onClick={props.onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-sm font-medium">{props.character.name}</div>
          <div className="mt-1 break-words text-xs text-neutral-500">
            {props.character.kind}
          </div>
        </div>
        <StatusPill value={props.character.status} />
      </div>
      <div className="mt-3 break-words text-xs text-neutral-400">
        {props.character.role}
      </div>
      <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
        <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-200">
          {props.character.evidenceStatus}
        </span>
        <span className="rounded bg-white/8 px-2 py-1 text-neutral-300">
          {props.linkCount} link(s)
        </span>
      </div>
      <CompactCanCannot
        may={props.character.may}
        mayNot={props.character.mayNot}
      />
    </button>
  )
}

function CompactCanCannot(props: { may: string[]; mayNot: string[] }) {
  return (
    <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-2">
      <div>
        <div className="mb-1 text-neutral-500">Can</div>
        <ul className="space-y-1 text-neutral-300">
          {props.may.slice(0, 3).map((item) => (
            <li key={item} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-neutral-500">Cannot</div>
        <ul className="space-y-1 text-neutral-300">
          {props.mayNot.slice(0, 3).map((item) => (
            <li key={item} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ClientsPanel(props: {
  client?: DanPolicy['clients'][number]
  project?: DanPolicy['projects'][number]
  doppler: ReturnType<typeof getDopplerConfigMetadata>
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Active client">
        <KeyValue label="Client" value={props.client?.name ?? 'Missing'} />
        <KeyValue label="Policy profile" value={props.client?.policyProfile ?? 'Missing'} />
        <KeyValue label="Secrets profile" value={props.client?.secretsProfile ?? 'Missing'} />
      </Panel>
      <Panel title="Active project">
        <KeyValue label="Project" value={props.project?.name ?? 'Missing'} />
        <KeyValue label="Repo" value={props.project?.repo ?? 'Missing'} />
        <KeyValue label="Doppler metadata" value={`${props.doppler.project}/${props.doppler.config}`} />
      </Panel>
    </div>
  )
}

function ActorsPanel(props: { policy?: DanPolicy }) {
  return (
    <Panel title="Actors">
      <div className="grid gap-3 lg:grid-cols-3">
        {(props.policy?.actors ?? []).map((actor) => (
          <div key={actor.id} className="rounded-md border border-white/10 bg-black/20 p-3">
            <div className="text-sm font-medium">{actor.id}</div>
            <div className="mt-1 text-xs text-neutral-400">{actor.kind}</div>
            <div className="mt-3 flex flex-wrap gap-1">
              {actor.roles.map((role) => (
                <span key={role} className="rounded bg-white/8 px-2 py-1 text-xs">
                  {role}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function AnalyticsPanel(props: {
  gates: number
  receipts: number
  ghosts: number
  events: number
}) {
  return (
    <Panel title="Governance analytics">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Gates" value={props.gates} />
        <Metric label="Receipts" value={props.receipts} />
        <Metric label="Ghosts" value={props.ghosts} />
        <Metric label="Trace events" value={props.events} />
      </div>
    </Panel>
  )
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="text-xs text-neutral-500">{props.label}</div>
      <div className="mt-2 text-2xl text-neutral-100">{props.value}</div>
    </div>
  )
}

function StubWorkbench(props: {
  title: string
  text: string
  actionId: ControlPlaneAction
  onAction: (actionId: ControlPlaneAction) => void
}) {
  const action = getControlPlaneAction(props.actionId)
  return (
    <Panel title={props.title}>
      <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-6">
        <div className="max-w-2xl text-sm text-neutral-400">{props.text}</div>
        <div className="mt-4">
          <Button
            actionId={props.actionId}
            onAction={props.onAction}
            icon={<PlayIcon />}
            variant="subtle"
          >
            {action.label}
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function ConsequenceRail(props: {
  decision: PolicyDecision | null
  gates: GateRequest[]
  windows: ExecutionWindow[]
  receipts: Receipt[]
}) {
  const latestGate = props.gates[0]
  const latestWindow = props.windows[0]
  const latestReceipt = props.receipts[0]
  const ghosts = props.receipts.flatMap((receipt) => receipt.ghosts)
  const nextAction =
    latestGate?.status === 'pending'
      ? 'Approve, deny, or ghost the pending gate.'
      : latestWindow && !latestWindow.consumedAt
        ? 'Consume the execution window once.'
        : latestReceipt?.status === 'open'
          ? 'Close receipt with evidence or leave it open.'
          : 'Run protected-command proof.'

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="mb-3 text-sm font-semibold">Consequence context</div>
      <RailLine label="Policy decision" value={props.decision?.kind ?? 'none'} />
      <RailLine label="Required gate" value={latestGate?.status ?? 'none'} />
      <RailLine
        label="Execution window"
        value={
          latestWindow
            ? latestWindow.consumedAt
              ? 'consumed'
              : 'ready'
            : 'none'
        }
      />
      <RailLine
        label="Evidence"
        value={latestReceipt ? `${latestReceipt.evidence.length} item(s)` : 'none'}
      />
      <RailLine label="Receipt" value={latestReceipt?.status ?? 'none'} />
      <RailLine label="Ghosts" value={ghosts.length ? String(ghosts.length) : 'none'} />
      <div className="mt-3 rounded-md bg-white/[0.04] p-2 text-xs text-neutral-300">
        <div className="text-neutral-500">Next admissible action</div>
        <div className="mt-1">{nextAction}</div>
      </div>
    </div>
  )
}

function UniversalPreviewPlane(props: {
  decision: PolicyDecision | null
  events: GovernanceEvent[]
  gates: GateRequest[]
  lastError?: string
  mode: PreviewMode
  onModeChange: (mode: PreviewMode) => void
  policyText: string
  receipts: Receipt[]
  selectedCharacter?: Character
  selectedCharacterLinks: CharacterLink[]
  windows: ExecutionWindow[]
}) {
  return (
    <aside className="h-full overflow-y-auto overflow-x-hidden border-l border-white/10 bg-[#141414] p-4">
      <PlaneLabel>Plane 3 · Universal preview</PlaneLabel>
      <div className="mb-4">
        <div className="text-sm font-semibold">Universal preview area</div>
        <p className="mt-1 text-xs text-neutral-500">
          Always previews consequence, evidence, receipts, or source for the
          selected object.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-5 gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
        <PreviewModeButton
          active={props.mode === 'consequence'}
          label="Context"
          onClick={() => props.onModeChange('consequence')}
        />
        <PreviewModeButton
          active={props.mode === 'trace'}
          label="Trace"
          onClick={() => props.onModeChange('trace')}
        />
        <PreviewModeButton
          active={props.mode === 'character'}
          label="Character"
          onClick={() => props.onModeChange('character')}
        />
        <PreviewModeButton
          active={props.mode === 'receipt'}
          label="Receipt"
          onClick={() => props.onModeChange('receipt')}
        />
        <PreviewModeButton
          active={props.mode === 'json'}
          label="JSON"
          onClick={() => props.onModeChange('json')}
        />
      </div>

      {props.lastError && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {props.lastError}
        </div>
      )}

      {props.mode === 'consequence' && (
        <ConsequenceRail
          decision={props.decision}
          gates={props.gates}
          receipts={props.receipts}
          windows={props.windows}
        />
      )}
      {props.mode === 'trace' && <TracePreview events={props.events} />}
      {props.mode === 'character' && (
        <CharacterPreview
          character={props.selectedCharacter}
          links={props.selectedCharacterLinks}
        />
      )}
      {props.mode === 'receipt' && <ReceiptPreview receipt={props.receipts[0]} />}
      {props.mode === 'json' && <JsonPreview policyText={props.policyText} />}
    </aside>
  )
}

function PreviewModeButton(props: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`rounded-md px-2 py-1.5 text-xs ${
        props.active
          ? 'bg-white/10 text-white'
          : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-200'
      }`}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  )
}

function TracePreview(props: { events: GovernanceEvent[] }) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold">Evidence / trace</div>
      <div className="space-y-2">
        {props.events.map((event) => (
          <div
            key={event.id}
            className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-xs text-neutral-300"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words font-medium text-neutral-200">
                {event.kind}
              </span>
              <span className="shrink-0 text-neutral-600">
                {new Date(event.createdAt).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
            <div className="mt-1 break-words text-neutral-400">{event.message}</div>
            {event.actionId ? (
              <div className="mt-1 break-words text-[11px] text-neutral-600">
                {event.actionId}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function CharacterPreview(props: {
  character?: Character
  links: CharacterLink[]
}) {
  if (!props.character) {
    return (
      <div className="rounded-md border border-dashed border-white/10 p-4 text-sm text-neutral-500">
        No character selected.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="text-sm font-semibold">{props.character.name}</div>
        <div className="mt-1 break-words text-xs text-neutral-500">
          {props.character.kind}
        </div>
        <div className="mt-3 break-words text-sm text-neutral-300">
          {props.character.role}
        </div>
        <div className="mt-3 flex flex-wrap gap-1 text-xs">
          <StatusPill value={props.character.status} />
          <span className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-neutral-200">
            {props.character.evidenceStatus}
          </span>
        </div>
      </div>
      <CharacterList title="Can" items={props.character.may} />
      <CharacterList title="Cannot" items={props.character.mayNot} />
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Links
        </div>
        <div className="space-y-2">
          {props.links.map((link) => (
            <div
              className="rounded-md bg-white/[0.04] p-2 text-xs text-neutral-300"
              key={link.id}
            >
              <div className="break-words font-medium text-neutral-200">
                {link.from === props.character?.id ? link.relation : `is ${link.relation} by`}
              </div>
              <div className="mt-1 break-words text-neutral-500">
                {link.from === props.character?.id ? link.to : link.from}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CharacterList(props: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {props.title}
      </div>
      <ul className="space-y-1 text-xs text-neutral-300">
        {props.items.map((item) => (
          <li className="break-words" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReceiptPreview(props: { receipt?: Receipt }) {
  if (!props.receipt) {
    return (
      <div className="rounded-md border border-dashed border-white/10 p-4 text-sm text-neutral-500">
        No receipt selected yet. Run the protected-command proof to create a
        receipt draft.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="text-sm font-medium">{props.receipt.scopeClaimed}</div>
        <div className="mt-1 text-xs text-neutral-500">{props.receipt.id}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <RailLine label="Status" value={props.receipt.status} />
          <RailLine
            label="Evidence"
            value={`${props.receipt.evidence.length} item(s)`}
          />
          <RailLine label="Proven" value={String(props.receipt.proven.length)} />
          <RailLine label="Ghosts" value={String(props.receipt.ghosts.length)} />
        </div>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Evidence attached
        </div>
        <div className="space-y-2">
          {props.receipt.evidence.map((evidence) => (
            <div
              key={evidence.id}
              className="rounded-md bg-white/[0.04] p-2 text-xs text-neutral-300"
            >
              <div className="font-medium text-neutral-200">{evidence.kind}</div>
              <div className="mt-1 text-neutral-500">{evidence.summary || evidence.id}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function JsonPreview(props: { policyText: string }) {
  return (
    <pre className="max-h-[calc(100vh-12rem)] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
      {props.policyText}
    </pre>
  )
}

function RailLine(props: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 text-xs last:mb-0">
      <span className="text-neutral-500">{props.label}</span>
      <span className="min-w-0 break-words text-right text-neutral-200">{props.value}</span>
    </div>
  )
}

function GatesPanel(props: {
  gates: GateRequest[]
  windows: ExecutionWindow[]
  onAction: (
    actionId: ControlPlaneAction,
    payload?: { gate?: GateRequest; window?: ExecutionWindow }
  ) => void
}) {
  return (
    <Panel title="Gate queue">
      <div className="space-y-3">
        {props.gates.length === 0 && (
          <EmptyState text="No gates yet. Attempt the protected command to create one." />
        )}
        {props.gates.map((gate) => {
          const window = props.windows.find((item) => item.gateRequestId === gate.id)
          return (
            <div key={gate.id} className="rounded-md border border-white/10 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{gate.action}</div>
                  <div className="mt-1 text-xs text-neutral-400">{gate.decision.reason}</div>
                  <div className="mt-2 text-xs text-neutral-500">{gate.resource}</div>
                </div>
                <StatusPill value={gate.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {gate.status === 'pending' && (
                  <>
                    <Button
                      actionId="gate.approve"
                      onAction={(actionId) => props.onAction(actionId, { gate })}
                      icon={<CheckIcon />}
                    >
                      Approve
                    </Button>
                    <Button
                      actionId="gate.deny"
                      onAction={(actionId) => props.onAction(actionId, { gate })}
                      icon={<XIcon />}
                      variant="subtle"
                    >
                      Deny
                    </Button>
                    <Button
                      actionId="gate.ghost"
                      onAction={(actionId) => props.onAction(actionId, { gate })}
                      icon={<CircleSlashIcon />}
                      variant="subtle"
                    >
                      Ghost
                    </Button>
                  </>
                )}
                {window && !window.consumedAt && (
                  <Button
                    actionId="probe.run"
                    onAction={(actionId) => props.onAction(actionId, { window })}
                    icon={<PlayIcon />}
                  >
                    Consume window once
                  </Button>
                )}
                {window?.consumedAt && (
                  <Button
                    actionId="probe.run"
                    onAction={(actionId) => props.onAction(actionId, { window })}
                    icon={<PlayIcon />}
                    variant="subtle"
                  >
                    Try reuse window
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function PoliciesPanel(props: {
  policyText: string
  policyError?: string
  decisionPreview: PolicyDecision | null
  onChange: (text: string) => void
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel title="Dan JSON">
        <textarea
          className="h-[34rem] w-full resize-none rounded-md border border-white/10 bg-black/30 p-3 font-mono text-xs text-neutral-100 outline-none focus:border-blue-500"
          onChange={(event) => props.onChange(event.target.value)}
          spellCheck={false}
          value={props.policyText}
        />
      </Panel>
      <div className="space-y-4">
        <Panel title="Schema validation">
          {props.policyError ? (
            <div className="text-sm text-red-200">{props.policyError}</div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-200">
              <BadgeCheckIcon className="h-4 w-4" />
              Dan JSON is schema-valid.
            </div>
          )}
        </Panel>
        <Panel title="Decision preview">
          {props.decisionPreview ? (
            <div className="space-y-2 text-sm">
              <StatusPill value={props.decisionPreview.kind} />
              <div className="text-neutral-300">{props.decisionPreview.reason}</div>
              <div className="text-xs text-neutral-500">
                Rules: {props.decisionPreview.ruleIds.join(', ') || 'none'}
              </div>
            </div>
          ) : (
            <EmptyState text="Fix policy JSON to preview decisions." />
          )}
        </Panel>
      </div>
    </div>
  )
}

function EnginesPanel(props: { doppler: ReturnType<typeof getDopplerConfigMetadata> }) {
  return (
    <div className="space-y-4">
      <Panel title="Engine registry">
        <div className="grid gap-3 lg:grid-cols-3">
          {engineRegistry.map((engine) => (
            <div key={engine.id} className="rounded-md border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-medium">{engine.name}</div>
              <div className="mt-1 min-h-10 text-xs text-neutral-400">{engine.description}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {engine.capabilities.map((capability) => (
                  <span key={capability} className="rounded bg-white/8 px-2 py-1 text-xs">
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Doppler metadata boundary">
        <KeyValue label="Project" value={props.doppler.project} />
        <KeyValue label="Config" value={props.doppler.config} />
        <KeyValue label="Secret values exposed" value={String(props.doppler.exposesSecretValues)} />
        <KeyValue label="Known variable names" value={props.doppler.variablesKnown?.join(', ') ?? 'none'} />
      </Panel>
    </div>
  )
}

function CandidatesPanel(props: {
  candidates: FeatureCandidate[]
  onAction: (actionId: ControlPlaneAction) => void
}) {
  return (
    <Panel title="Feature candidates">
      <div className="mb-4 rounded-md border border-white/10 bg-black/20 p-3">
        <div className="text-sm font-medium">Create admissible intent</div>
        <div className="mt-1 text-xs text-neutral-400">
          New Feature creates a FeatureCandidate and a WorkorderDraft. It does
          not execute code.
        </div>
        <div className="mt-3">
          <Button
            actionId="feature.create"
            onAction={props.onAction}
            icon={<PlusIcon />}
          >
            New Feature
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {props.candidates.length === 0 && (
          <EmptyState text="No candidates yet. Create a new feature intent to seed a workorder draft." />
        )}
        {props.candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="rounded-md border border-white/10 bg-black/20 p-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="break-words text-sm font-medium">{candidate.title}</div>
                <div className="mt-1 break-words text-xs text-neutral-500">
                  {candidate.id}
                </div>
              </div>
              <StatusPill value={candidate.status} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function WorkordersPanel(props: {
  workorders: Workorder[]
  onAction: (actionId: ControlPlaneAction) => void
}) {
  return (
    <Panel title="Workorders">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          actionId="feature.create"
          onAction={props.onAction}
          icon={<PlusIcon />}
          variant="subtle"
        >
          New Feature
        </Button>
        <Button
          actionId="gate.create"
          onAction={props.onAction}
          icon={<KeyRoundIcon />}
          variant="subtle"
        >
          Create Gate
        </Button>
      </div>
      <div className="space-y-3">
        {props.workorders.map((workorder) => (
          <div key={workorder.id} className="rounded-md border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="break-words text-sm font-medium">{workorder.title}</div>
                <div className="mt-1 break-words text-xs text-neutral-400">{workorder.action}</div>
                <div className="mt-1 break-words text-xs text-neutral-600">{workorder.resource}</div>
              </div>
              <StatusPill value={workorder.status} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function ReceiptsPanel(props: {
  receipts: Receipt[]
  onAction: (actionId: ControlPlaneAction, payload?: { receipt?: Receipt }) => void
  onGhostProbe: () => void
}) {
  return (
    <Panel title="Receipts">
      <div className="mb-4 rounded-md border border-white/10 bg-black/20 p-3">
        <div className="text-sm font-medium">Probe receipt closure without evidence</div>
        <div className="mt-1 text-xs text-neutral-400">Expected: ghosted</div>
        <div className="mt-3">
          <Button
            actionId="receipt.close"
            onAction={() => props.onGhostProbe()}
            icon={<CircleSlashIcon />}
            variant="subtle"
          >
            Run Probe
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {props.receipts.length === 0 && (
          <EmptyState text="No receipts yet. Run the protected-command proof to create a receipt draft." />
        )}
        {props.receipts.map((receipt) => (
          <div key={receipt.id} className="rounded-md border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{receipt.scopeClaimed}</div>
                <div className="mt-1 text-xs text-neutral-500">{receipt.id}</div>
              </div>
              <StatusPill value={receipt.status} />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-neutral-400 md:grid-cols-3">
              <div>Evidence: {receipt.evidence.length}</div>
              <div>Proven: {receipt.proven.length}</div>
              <div>Ghosts: {receipt.ghosts.length}</div>
            </div>
            {receipt.status === 'open' && receipt.evidence.length > 0 && (
              <div className="mt-3">
                <Button
                  actionId="receipt.close"
                  onAction={(actionId) => props.onAction(actionId, { receipt })}
                  icon={<FileCheckIcon />}
                >
                  Close with evidence
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function KeyValue(props: { label: string; value: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-xs text-neutral-500">{props.label}</div>
      <div className="text-sm text-neutral-200">{props.value}</div>
    </div>
  )
}

function EmptyState(props: { text: string }) {
  return <div className="rounded-md border border-dashed border-white/10 p-6 text-sm text-neutral-500">{props.text}</div>
}

function StatusPill(props: { value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-xs text-neutral-200">
      {props.value}
    </span>
  )
}

function Button(props: {
  children: React.ReactNode
  actionId: ControlPlaneAction
  icon?: React.ReactElement
  onAction: (actionId: ControlPlaneAction) => void
  variant?: 'primary' | 'subtle'
}) {
  const action = getControlPlaneAction(props.actionId)
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
        props.variant === 'subtle'
          ? 'border border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10'
          : 'bg-blue-500 text-white hover:bg-blue-400'
      }`}
      onClick={() => props.onAction(props.actionId)}
      title={`${action.id} · creates ${action.creates.join(', ')}`}
      type="button"
    >
      {props.icon ? <span className="[&>svg]:h-4 [&>svg]:w-4">{props.icon}</span> : null}
      {props.children}
    </button>
  )
}
