export type CharacterFamily =
  | 'logline'
  | 'dan'
  | 'minilab'
  | 'authority'
  | 'lab'
  | 'agent'
  | 'store'
  | 'edge'
  | 'engine'
  | 'work'
  | 'proof'

export type CharacterStatus =
  | 'active'
  | 'partial'
  | 'planned'
  | 'ghost'
  | 'retired'

export type EvidenceStatus =
  | 'declared'
  | 'observed'
  | 'verified'
  | 'unverified'

export interface Character {
  id: string
  name: string
  family: CharacterFamily
  kind: string
  role: string
  may: string[]
  mayNot: string[]
  status: CharacterStatus
  evidenceStatus: EvidenceStatus
}

export interface CharacterLink {
  id: string
  from: string
  relation:
    | 'stewards'
    | 'defines'
    | 'powers'
    | 'instantiated_as'
    | 'operates'
    | 'controls'
    | 'contains'
    | 'speaks'
    | 'calls'
    | 'emits'
    | 'runs'
    | 'prepares'
    | 'governs'
    | 'authorizes'
    | 'requires'
    | 'executes'
    | 'translates'
    | 'proposes'
    | 'produces'
    | 'closes'
    | 'projects_to'
    | 'stores'
    | 'serves'
    | 'exposes_via'
  to: string
  status: CharacterStatus
  evidenceStatus: EvidenceStatus
}

export interface MinilabUniverse {
  version: 'minilab-universe.v0'
  productContext: {
    company: 'LogLine'
    technology: 'LogLine'
    productLine: 'LogLine Automation'
    instance: 'LogLine Automation for minilab.work'
    cockpit: 'Dan Control Plane'
  }
  characters: Character[]
  links: CharacterLink[]
}

export function findCharacter(universe: MinilabUniverse, id: string) {
  return universe.characters.find((character) => character.id === id)
}

export function characterLinks(universe: MinilabUniverse, id: string) {
  return universe.links.filter((link) => link.from === id || link.to === id)
}
