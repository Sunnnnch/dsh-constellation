/**
 * Human-saved command snippets. They are *not* a capability layer: a snippet is
 * just text that a person chose to keep, and running one goes through the same
 * exec path (and the same dangerous-command gate) as any other command.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { snippetsPath } from './paths.js'

const EMPTY = { version: 1, snippets: [] }

/** Normalize one stored snippet. */
function normalize(raw, index) {
  const command = String(raw.command || '').trim()
  if (!command) return undefined
  const name = String(raw.name || command.split('\n')[0]).trim().slice(0, 100)
  const id = String(raw.id || name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return { id: id || `snippet-${index}`, name: name || command.slice(0, 60), command, tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [] }
}

/** Load every snippet; a corrupt file reads as empty rather than failing the panel. */
export function loadSnippets() {
  const path = snippetsPath()
  if (!existsSync(path)) return { ...EMPTY, snippets: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return { version: 1, snippets: Array.isArray(parsed.snippets) ? parsed.snippets.map(normalize).filter(Boolean) : [] }
  } catch {
    return { ...EMPTY, snippets: [] }
  }
}

/** Persist snippets atomically. */
export function saveSnippets(state) {
  mkdirSync(dirname(snippetsPath()), { recursive: true })
  const path = snippetsPath()
  writeFileSync(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(`${path}.tmp`, path)
}
