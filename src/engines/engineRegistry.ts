import type { Capability } from '@/src/dan/contracts'

export interface EngineDescriptor {
  id: string
  name: string
  description: string
  capabilities: Capability[]
  status: 'available' | 'configured' | 'metadata_only'
}

export const engineRegistry: EngineDescriptor[] = [
  {
    id: 'local_shell',
    name: 'Local Shell',
    description: 'Runs scoped local commands only after a valid execution window.',
    capabilities: ['execute'],
    status: 'available',
  },
  {
    id: 'vercel_sandbox',
    name: 'Vercel Sandbox',
    description:
      'Executes generated code in an isolated Vercel Sandbox when credentials and sandbox id exist.',
    capabilities: ['execute'],
    status: 'configured',
  },
  {
    id: 'doppler_config',
    name: 'Doppler Config',
    description:
      'Projects secrets/config metadata into the control plane without exposing secret values.',
    capabilities: ['summarize'],
    status: 'metadata_only',
  },
]
