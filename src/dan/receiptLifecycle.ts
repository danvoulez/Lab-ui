import type { Evidence, Receipt } from './contracts'

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createReceiptDraft(input: {
  workorderId: string
  scopeClaimed: string
  now?: Date
}): Receipt {
  const now = input.now ?? new Date()
  return {
    id: createId('receipt'),
    workorderId: input.workorderId,
    status: 'open',
    scopeClaimed: input.scopeClaimed,
    evidence: [],
    proven: [],
    notProven: [],
    ghosts: [],
    createdAt: now.toISOString(),
  }
}

export function attachEvidence(input: {
  receipt: Receipt
  evidence: Evidence[]
}): Receipt {
  if (input.receipt.status !== 'open') {
    throw new Error('Evidence can only be attached to an open receipt.')
  }
  return {
    ...input.receipt,
    evidence: [...input.receipt.evidence, ...input.evidence],
  }
}

export function closeReceipt(input: {
  receipt: Receipt
  proven: string[]
  notProven: string[]
  evidenceIds: string[]
  ghosts?: string[]
  now?: Date
}): Receipt {
  if (input.receipt.status !== 'open') {
    throw new Error('Only open receipts can be closed.')
  }

  if (input.receipt.evidence.length === 0 || input.evidenceIds.length === 0) {
    return {
      ...input.receipt,
      status: 'ghosted',
      ghosts: [
        ...input.receipt.ghosts,
        'Receipt closure attempted without evidence.',
      ],
    }
  }

  const evidenceIds = new Set(input.receipt.evidence.map((item) => item.id))
  const missing = input.evidenceIds.filter((id) => !evidenceIds.has(id))
  if (missing.length > 0) {
    throw new Error(`Receipt closure references unknown evidence: ${missing.join(', ')}`)
  }

  const now = input.now ?? new Date()
  return {
    ...input.receipt,
    status: 'closed',
    proven: input.proven,
    notProven: input.notProven,
    ghosts: input.ghosts ?? input.receipt.ghosts,
    closedAt: now.toISOString(),
  }
}
