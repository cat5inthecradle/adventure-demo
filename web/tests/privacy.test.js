// Guards the claims in docs/PRIVACY.md: the app's own code makes no network
// requests, the page loads nothing from another site, and every browser-storage
// key the code uses is listed in that document.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = new URL('..', import.meta.url).pathname
const read = path => readFileSync(join(root, path), 'utf8')

function sourceFiles(dir = 'src') {
  return readdirSync(join(root, dir)).flatMap(name => {
    const path = join(dir, name)
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path)
    return /\.(js|vue|css)$/.test(name) ? [path] : []
  })
}

const files = sourceFiles()
// The deploy copy of this folder has no docs/ beside it; the checks run in the full repository.
const docPath = join(root, '../docs/PRIVACY.md')
const privacy = existsSync(docPath) ? readFileSync(docPath, 'utf8') : null

describe.skipIf(privacy === null)('docs/PRIVACY.md', () => {
  it('holds: the app’s own code makes no network requests and reads no location or cookies', () => {
    const banned = [
      /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /\bWebSocket\b/, /\bEventSource\b/,
      /document\.cookie/, /navigator\.geolocation/,
    ]
    expect(files.length).toBeGreaterThan(20)
    for (const path of files) {
      const text = read(path)
      for (const pattern of banned) expect(pattern.test(text), `${path} uses ${pattern}`).toBe(false)
    }
  })

  it('holds: no source file or the page itself points at another site', () => {
    for (const path of [...files, 'index.html']) {
      expect(/https?:\/\//.test(read(path)), `${path} contains a web address`).toBe(false)
    }
  })

  it('holds: storage is localStorage only, and every key is in the document', () => {
    const keys = new Set()
    for (const path of files) {
      const text = read(path)
      expect(/sessionStorage|indexedDB/.test(text), `${path} uses another kind of storage`).toBe(false)
      for (const [key] of text.matchAll(/adventure-lab:[a-z0-9-]+(?::[a-z0-9-]+)*:?/g)) keys.add(key)
    }
    expect(keys.size).toBeGreaterThanOrEqual(6)
    for (const key of keys) {
      const listed = key.endsWith(':') ? `\`${key}…\`` : `\`${key}\``
      expect(privacy, `${key} is not listed in docs/PRIVACY.md`).toContain(listed)
    }
  })

  it('does not claim a privacy review that has not happened', () => {
    expect(privacy).toMatch(/no data-privacy review has\s+happened/)
    expect(privacy).toMatch(/proposed, not built/)
  })
})
