import { describe, expect, it } from 'vitest'
import policy from './dan-policy.local.json'
import type { DanPolicy, EngineExecutionInput } from './contracts'
import { approveGateRequest, consumeExecutionWindow, createGateRequest, createScopeHash } from './gateLifecycle'
import { attachEvidence, closeReceipt, createReceiptDraft } from './receiptLifecycle'
import { evaluatePolicy } from './evaluatePolicy'
import { getDopplerConfigMetadata } from '@/src/engines/dopplerConfigEngine'
import { localShellEngine } from '@/src/engines/localShellEngine'
import { loadJson, saveJson } from '@/src/ui/control-plane/persistence'
import { validateDanPolicy } from './validatePolicy'
import { controlPlaneActions } from './actionRegistry'
import { minilabUniverseSeed } from './minilabUniverseSeed'
import { findCharacter } from './minilabUniverse'

const danPolicy = policy as DanPolicy

describe('Dan Control Plane v0 kernel', () => {
  it('rejects malformed Dan JSON', () => {
    expect(validateDanPolicy({ version: 'dan.policy.v0' })).toBe(false)
  })

  it('denies local_llm execution', () => {
    const decision = evaluatePolicy(
      {
        actorId: 'actor_local_llm',
        actorKind: 'local_llm',
        projectId: 'project_control_plane',
        action: 'shell.risky_command',
        resource: 'demo',
        capability: 'execute',
      },
      danPolicy
    )

    expect(decision.kind).toBe('denied')
    expect(decision.ruleIds).toContain('rule_local_llm_no_execution')
  })

  it('creates a gate decision for dependency installs', () => {
    const decision = evaluatePolicy(
      {
        actorId: 'actor_vercel_sandbox',
        actorKind: 'sdk_tool',
        projectId: 'project_control_plane',
        action: 'shell.install_dependency',
        resource: 'pnpm add left-pad',
        capability: 'execute',
      },
      danPolicy
    )

    expect(decision.kind).toBe('needs_approval')
    expect(decision.requiredEvidence).toEqual([
      'command',
      'stdout',
      'stderr',
      'exit_code',
    ])
  })

  it('does not execute a protected command before approval', async () => {
    const input = createDemoInput()
    await expect(localShellEngine.execute(input)).rejects.toThrow(
      'valid execution window'
    )
  })

  it('approves a gate and creates a scoped single-use execution window', async () => {
    const input = createDemoInput()
    const decision = evaluatePolicy(
      {
        actorId: input.actorId,
        actorKind: 'sdk_tool',
        projectId: 'project_control_plane',
        action: input.action,
        resource: input.resource,
        capability: 'execute',
      },
      danPolicy
    )
    const gate = createGateRequest({
      actorId: input.actorId,
      action: input.action,
      resource: input.resource,
      decision,
    })
    const { executionWindow } = approveGateRequest({
      gate,
      approverActorId: 'actor_dan',
    })

    expect(executionWindow.singleUse).toBe(true)
    expect(executionWindow.scopeHash).toBe(input.scopeHash)

    const result = await localShellEngine.execute(input, executionWindow)
    expect(result.evidence.some((item) => item.kind === 'stdout')).toBe(true)
    expect(result.executionWindow.consumedAt).toBeDefined()
  })

  it('does not reuse consumed or expired execution windows', () => {
    const input = createDemoInput()
    const gate = createGateRequest({
      actorId: input.actorId,
      action: input.action,
      resource: input.resource,
      decision: {
        kind: 'needs_approval',
        reason: 'test',
        ruleIds: ['test'],
      },
      now: new Date('2026-05-15T00:00:00.000Z'),
    })
    const { executionWindow } = approveGateRequest({
      gate,
      approverActorId: 'actor_dan',
      now: new Date('2026-05-15T00:00:01.000Z'),
      ttlMs: 1000,
    })
    const consumed = consumeExecutionWindow({
      executionWindow,
      actorId: input.actorId,
      action: input.action,
      resource: input.resource,
      scopeHash: input.scopeHash,
      now: new Date('2026-05-15T00:00:01.500Z'),
    })

    expect(() =>
      consumeExecutionWindow({
        executionWindow: consumed,
        actorId: input.actorId,
        action: input.action,
        resource: input.resource,
        scopeHash: input.scopeHash,
      })
    ).toThrow('already consumed')

    expect(() =>
      consumeExecutionWindow({
        executionWindow,
        actorId: input.actorId,
        action: input.action,
        resource: input.resource,
        scopeHash: input.scopeHash,
        now: new Date('2026-05-15T00:00:03.000Z'),
      })
    ).toThrow('expired')
  })

  it('ghosts receipt closure without evidence', () => {
    const receipt = createReceiptDraft({
      workorderId: 'workorder_test',
      scopeClaimed: 'no evidence',
    })
    const closed = closeReceipt({
      receipt,
      proven: [],
      notProven: ['No evidence exists.'],
      evidenceIds: [],
    })

    expect(closed.status).toBe('ghosted')
  })

  it('closes receipt with referenced evidence', () => {
    const receipt = createReceiptDraft({
      workorderId: 'workorder_test',
      scopeClaimed: 'with evidence',
    })
    const withEvidence = attachEvidence({
      receipt,
      evidence: [
        {
          id: 'ev_1',
          kind: 'stdout',
          action: 'shell.risky_command',
          resource: 'demo',
          producedAt: '2026-05-15T00:00:00.000Z',
          summary: 'ok',
          data: { stdout: 'ok' },
        },
      ],
    })
    const closed = closeReceipt({
      receipt: withEvidence,
      proven: ['stdout captured'],
      notProven: ['production behavior'],
      evidenceIds: ['ev_1'],
    })

    expect(closed.status).toBe('closed')
    expect(closed.proven).toEqual(['stdout captured'])
  })

  it('Doppler adapter never returns secret values', () => {
    const metadata = getDopplerConfigMetadata({
      project: 'minilab',
      config: 'dev',
      variablesKnown: ['TOKEN'],
    })

    expect(metadata.exposesSecretValues).toBe(false)
    expect(JSON.stringify(metadata)).not.toContain('secret_value')
  })

  it('persists local UI state through the storage boundary', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    }
    saveJson(storage, 'state', { tab: 'gates', count: 1 })
    expect(loadJson(storage, 'state', { tab: 'clients', count: 0 })).toEqual({
      tab: 'gates',
      count: 1,
    })
  })

  it('declares the universal action spine for visible control-plane buttons', () => {
    expect(controlPlaneActions['feature.create'].creates).toContain('WorkorderDraft')
    expect(controlPlaneActions['gate.approve'].creates).toContain('ExecutionWindow')
    expect(controlPlaneActions['probe.run'].requiresGate).toBe(true)
    expect(controlPlaneActions['receipt.close'].requiresEvidence).toBe(true)
  })

  it('seeds the Minilab product context', () => {
    expect(minilabUniverseSeed.productContext).toEqual({
      company: 'LogLine',
      technology: 'LogLine',
      productLine: 'LogLine Automation',
      instance: 'LogLine Automation for minilab.work',
      cockpit: 'Dan Control Plane',
    })
  })

  it('includes the required Minilab universe characters', () => {
    const ids = minilabUniverseSeed.characters.map((character) => character.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        'logline_company',
        'logline_technology',
        'logline_automation',
        'dan',
        'dan_control_plane',
        'minilab_work',
        'rust_minilab_cli',
        'constitutional_runtime',
        'tower',
        'lab_8gb',
        'lab_256',
        'lab_512',
        'chatgpt',
        'local_llm',
        'supabase_minilab',
        'doppler',
        'cloudflare_gateway',
        'receipts',
      ])
    )
  })

  it('keeps LogLine technology distinct from LogLine Automation', () => {
    const technology = findCharacter(minilabUniverseSeed, 'logline_technology')
    const automation = findCharacter(minilabUniverseSeed, 'logline_automation')

    expect(technology?.kind).toContain('technology')
    expect(automation?.kind).toBe('product_line')
    expect(automation?.mayNot).toContain('replace LogLine canon')
  })

  it('keeps minilab.work distinct from LogLine technology', () => {
    const minilab = findCharacter(minilabUniverseSeed, 'minilab_work')

    expect(minilab?.kind).toBe('operational universe')
    expect(minilab?.mayNot).toContain('be the universal LogLine registry')
    expect(minilab?.mayNot).toContain('replace LogLine technology')
  })

  it('marks Supabase as Minilab operational Postgres, not universal registry', () => {
    const supabase = findCharacter(minilabUniverseSeed, 'supabase_minilab')

    expect(supabase?.kind).toBe('operational_postgres')
    expect(supabase?.role).toContain('Minilab LogLine-shaped acts')
    expect(supabase?.mayNot).toContain('be universal LogLine registry')
  })

  it('marks LAB-256 as execution workbench, not governor', () => {
    const lab = findCharacter(minilabUniverseSeed, 'lab_256')

    expect(lab?.may).toContain('run approved probes')
    expect(lab?.mayNot).toContain('govern')
    expect(lab?.mayNot).toContain('approve itself')
  })

  it('marks ChatGPT as translator/proposer, not executor', () => {
    const chatgpt = findCharacter(minilabUniverseSeed, 'chatgpt')

    expect(chatgpt?.may).toContain('translate intent')
    expect(chatgpt?.may).toContain('propose candidates')
    expect(chatgpt?.mayNot).toContain('execute directly')
  })

  it('connects LogLine to LogLine Automation to minilab.work', () => {
    expect(minilabUniverseSeed.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'logline_technology',
          relation: 'powers',
          to: 'logline_automation',
        }),
        expect.objectContaining({
          from: 'logline_automation',
          relation: 'instantiated_as',
          to: 'minilab_work',
        }),
      ])
    )
  })
})

function createDemoInput(): EngineExecutionInput {
  const actorId = 'actor_vercel_sandbox'
  const action = 'shell.risky_command'
  const resource = 'demo-safe-node-command'
  return {
    actorId,
    action,
    resource,
    scopeHash: createScopeHash({ actorId, action, resource }),
    command: process.execPath,
    args: ['-e', "console.log('ok')"],
  }
}
