// Acceptance tests for the typo fixer's rule against correcting a word into one
// of two letters or fewer ("cup" must not quietly become "up").

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import { loadWorld } from '../../src/engine/loader.js'
import { takeTurn } from '../../src/engine/turn.js'
import { fixTypos } from '../../src/engine/parser.js'

const vocabulary = new Set(['examine', 'take', 'open', 'go', 'up', 'in', 'on', 'the', 'crate', 'prybar'])

describe('fixTypos', () => {
  it('never corrects a word into one of two letters or fewer', () => {
    const fixes = []
    expect(fixTypos(['examine', 'cup'], vocabulary, fixes)).toEqual(['examine', 'cup'])
    expect(fixTypos(['go', 'upp'], vocabulary)).toEqual(['go', 'upp'])
    expect(fixTypos(['take', 'ion'], vocabulary)).toEqual(['take', 'ion'])
    expect(fixes.some(f => f.to === 'up')).toBe(false)
  })

  it('still corrects into longer words', () => {
    expect(fixTypos(['opne', 'the', 'crate'], vocabulary)).toEqual(['open', 'the', 'crate'])
    expect(fixTypos(['take', 'pyrbar'], vocabulary)).toEqual(['take', 'prybar'])
    expect(fixTypos(['examine', 'crat'], vocabulary)).toEqual(['examine', 'crate'])
  })
})

describe('an unknown short word in play', () => {
  it('is reported as unknown instead of being read as a direction', async () => {
    const world = loadWorld(space)
    const turn = await takeTurn(world, 'examine cup')
    const typos = turn.parseTrace.find(s => s.stage === 'typos')
    expect((typos?.fixes ?? []).some(f => f.to === 'up')).toBe(false)
    expect(turn.text).toMatch(/cup/)
  })
})
