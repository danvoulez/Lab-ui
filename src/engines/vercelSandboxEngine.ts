import { Sandbox } from '@vercel/sandbox'
import type {
  Engine,
  EngineExecutionInput,
  EngineExecutionResult,
  Evidence,
  ExecutionWindow,
} from '@/src/dan/contracts'
import { consumeExecutionWindow } from '@/src/dan/gateLifecycle'

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export const vercelSandboxEngine: Engine = {
  id: 'vercel_sandbox',
  name: 'Vercel Sandbox',
  capabilities: ['execute'],
  async execute(
    input: EngineExecutionInput,
    window?: ExecutionWindow
  ): Promise<EngineExecutionResult> {
    if (!window) {
      throw new Error('Vercel Sandbox execution requires an execution window.')
    }
    const consumedWindow = consumeExecutionWindow({
      executionWindow: window,
      actorId: input.actorId,
      action: input.action,
      resource: input.resource,
      scopeHash: input.scopeHash,
    })

    const sandboxId = input.resource
    if (!sandboxId || !input.command) {
      throw new Error('Vercel Sandbox execution requires sandbox id and command.')
    }

    const sandbox = await Sandbox.get({ sandboxId })
    const command = await sandbox.runCommand({
      cmd: input.command,
      args: input.args ?? [],
      detached: false,
    })
    const done = await command.wait()
    const [stdout, stderr] = await Promise.all([
      done.stdout(),
      done.stderr(),
    ])
    const producedAt = new Date().toISOString()
    const evidence: Evidence[] = [
      {
        id: createId('ev'),
        kind: 'command',
        action: input.action,
        resource: input.resource,
        producedAt,
        summary: `${input.command} ${(input.args ?? []).join(' ')}`.trim(),
        data: { command: input.command, args: input.args ?? [] },
      },
      {
        id: createId('ev'),
        kind: 'stdout',
        action: input.action,
        resource: input.resource,
        producedAt,
        summary: stdout.slice(0, 200),
        data: { stdout },
      },
      {
        id: createId('ev'),
        kind: 'stderr',
        action: input.action,
        resource: input.resource,
        producedAt,
        summary: stderr.slice(0, 200),
        data: { stderr },
      },
      {
        id: createId('ev'),
        kind: 'exit_code',
        action: input.action,
        resource: input.resource,
        producedAt,
        summary: `exit code ${done.exitCode}`,
        data: { exitCode: done.exitCode },
      },
    ]

    return { evidence, executionWindow: consumedWindow }
  },
}
