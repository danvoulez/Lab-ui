import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import schema from './dan-policy.schema.json'
import type { DanPolicy } from './contracts'

const ajv = new Ajv2020({ allErrors: true })
const validate = ajv.compile(schema)

export interface PolicyValidationResult {
  ok: boolean
  errors: ErrorObject[] | null | undefined
}

export function validateDanPolicy(value: unknown): value is DanPolicy {
  return validate(value) as boolean
}

export function getPolicyValidationResult(
  value: unknown
): PolicyValidationResult {
  const ok = validate(value) as boolean
  return { ok, errors: validate.errors }
}
