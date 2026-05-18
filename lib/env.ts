export function hasAiGatewayAuth() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}

export function hasSandboxAuth() {
  return Boolean(
    process.env.VERCEL_OIDC_TOKEN ||
      (process.env.VERCEL_TOKEN &&
        process.env.VERCEL_TEAM_ID &&
        process.env.VERCEL_PROJECT_ID)
  )
}

export function getAiGatewayAuthMessage() {
  return [
    'AI Gateway credentials are not configured.',
    'Run `vercel link && vercel env pull .env.local`, or set `AI_GATEWAY_API_KEY`.',
  ].join(' ')
}

export function getSandboxAuthMessage() {
  return [
    'Vercel Sandbox credentials are not configured.',
    'Run `vercel link && vercel env pull .env.local`, or set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`.',
  ].join(' ')
}
