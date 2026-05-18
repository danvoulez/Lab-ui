export interface DopplerConfigMetadata {
  project: string
  config: string
  exposesSecretValues: false
  variablesKnown?: string[]
}

export function getDopplerConfigMetadata(input?: {
  project?: string
  config?: string
  variablesKnown?: string[]
}): DopplerConfigMetadata {
  return {
    project: input?.project ?? process.env.DOPPLER_PROJECT ?? 'not_configured',
    config: input?.config ?? process.env.DOPPLER_CONFIG ?? 'not_configured',
    exposesSecretValues: false,
    variablesKnown: input?.variablesKnown ?? [],
  }
}
