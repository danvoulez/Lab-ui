import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  Engine,
  EngineExecutionInput,
  EngineExecutionResult,
  Evidence,
  ExecutionWindow,
} from '@/src/dan/contracts'
import { consumeExecutionWindow } from '@/src/dan/gateLifecycle'

const execFileAsync = promisify(execFile)

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

function assertExecutionWindow(
  input: EngineExecutionInput,
  window?: ExecutionWindow
) {
  if (!window) {
    throw new Error('Engine execution requires a valid execution window.')
  }
  return consumeExecutionWindow({
    executionWindow: window,
    actorId: input.actorId,
    action: input.action,
    resource: input.resource,
    scopeHash: input.scopeHash,
  })
}

export const localShellEngine: Engine = {
  id: 'local_shell',
  name: 'Local Shell',
  capabilities: ['execute'],
  async execute(
    input: EngineExecutionInput,
    window?: ExecutionWindow
  ): Promise<EngineExecutionResult> {
    const consumedWindow = assertExecutionWindow(input, window)
    const command = input.command
    if (!command) {
      throw new Error('Local shell execution requires a command.')
    }

    const args = input.args ?? []
    const producedAt = new Date().toISOString()

    try {
      const result = await execFileAsync(command, args, {
        cwd: process.cwd(),
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      })

      const evidence: Evidence[] = [
        {
          id: createId('ev'),
          kind: 'command',
          action: input.action,
          resource: input.resource,
          producedAt,
          summary: `${command} ${args.join(' ')}`.trim(),
          data: { command, args },
        },
        {
          id: createId('ev'),
          kind: 'stdout',
          action: input.action,
          resource: input.resource,
          producedAt,
          summary: result.stdout.slice(0, 200),
          data: { stdout: result.stdout },
        },
        {
          id: createId('ev'),
          kind: 'stderr',
          action: input.action,
          resource: input.resource,
          producedAt,
          summary: result.stderr.slice(0, 200),
          data: { stderr: result.stderr },
        },
        {
          id: createId('ev'),
          kind: 'exit_code',
          action: input.action,
          resource: input.resource,
          producedAt,
          summary: 'exit code 0',
          data: { exitCode: 0 },
        },
      ]

      return { evidence, executionWindow: consumedWindow }
    } catch (error) {
      const maybeError = error as {
        stdout?: string
        stderr?: string
        code?: number
        message?: string
      }
      const evidence: Evidence[] = [
        {
          id: createId('ev'),
          kind: 'command',
          action: input.action,
          resource: input.resource,
          producedAt,
          summary: `${command} ${args.join(' ')}`.trim(),
          data: { command, args },
        },
        {
          id: createId('ev'),
          kind: 'stdout',
          action: input.action,
          resource: input.resource,
          producedAt,
          summary: maybeError.stdout?.slice(0, 200) ?? '',
          data: { stdout: maybeError.stdout ?? '' },
        },
        {
          id: createId('ev'),
          kind: 'stderr',
          action: input.action,
          resource: input.resource,
          producedAt,
          summary: maybeError.stderr?.slice(0, 200) ?? maybeError.message ?? '',
          data: { stderr: maybeError.stderr ?? maybeError.message ?? '' },
        },
        {
          id: createId('ev'),
          kind: 'exit_code',
          action: input.action,
          resource: input.resource,
          producedAt,
          summary: `exit code ${maybeError.code ?? 1}`,
          data: { exitCode: maybeError.code ?? 1 },
        },
      ]
      return { evidence, executionWindow: consumedWindow }
    }
  },
}
