import { readFileSync, writeFileSync } from "node:fs"
const p = "lib/client.js"
let s = readFileSync(p, "utf8")
s = s.replace("borderStrong: 'rgba(99,102,241,.28)'", "borderStrong: 'rgba(148,163,184,.5)'")
s = s.replace("outline: 2px solid #6366f1", "outline: 2px solid var(--v-accent, #2563eb)")
s = s.split("background: active ? 'rgba(99,102,241,.14)' : 'transparent'").join("background: active ? 'color-mix(in srgb, var(--v-accent) 12%, transparent)' : 'transparent'")
writeFileSync(p, s, "utf8")
console.log("done")
