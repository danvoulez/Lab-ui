const requiredGroups = [
  {
    name: 'AI Gateway',
    ok: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    message:
      'Set AI_GATEWAY_API_KEY or run `vercel link && vercel env pull .env.local` to get VERCEL_OIDC_TOKEN.',
  },
  {
    name: 'Vercel Sandbox',
    ok: Boolean(
      process.env.VERCEL_OIDC_TOKEN ||
        (process.env.VERCEL_TOKEN &&
          process.env.VERCEL_TEAM_ID &&
          process.env.VERCEL_PROJECT_ID)
    ),
    message:
      'Run `vercel link && vercel env pull .env.local`, or set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID.',
  },
]

const missing = requiredGroups.filter((group) => !group.ok)

if (missing.length === 0) {
  console.log('Environment looks ready for local development.')
  process.exit(0)
}

console.error('Environment is missing required credentials:\n')
for (const group of missing) {
  console.error(`- ${group.name}: ${group.message}`)
}
console.error('\nSee README.md for setup details.')
process.exit(1)
