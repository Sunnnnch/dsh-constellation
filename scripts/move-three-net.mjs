import { readFileSync, writeFileSync } from 'node:fs'

const path = 'packages/dsh-vps/lib/client.js'
let source = readFileSync(path, 'utf8')
const titleAt = source.indexOf("el('h3', null, '三网延迟')")
if (titleAt < 0) {
  console.error('title not found')
  process.exit(1)
}
const panelStart = source.lastIndexOf("el('div', { className: 'v-panel' },", titleAt)
const bottomGridMark = "el('div', { className: 'v-grid3', style: compact ? { gridTemplateColumns: '1fr', gap: 10 } : { gridTemplateColumns: '1.35fr 1fr 1fr' } },"
const panelEnd = source.indexOf(bottomGridMark, titleAt)
const ringMark = "el('div', { className: 'v-grid3', style: compact ? { gridTemplateColumns: '1fr', gap: 10 } : null },"
const ringStart = source.indexOf(ringMark)
if (panelStart < 0 || panelEnd < 0 || ringStart < 0) {
  console.error('markers', panelStart, panelEnd, ringStart)
  process.exit(1)
}
const snippet = readFileSync('scripts/three-net-panel.snippet.js', 'utf8')
source = source.slice(0, panelStart) + source.slice(panelEnd)
const insertAt = source.indexOf(ringMark)
source = source.slice(0, insertAt) + snippet + source.slice(insertAt)
writeFileSync(path, source, 'utf8')
console.log('moved panel; removed', panelEnd - panelStart, 'bytes; inserted at', insertAt)
