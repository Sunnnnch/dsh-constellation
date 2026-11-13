import { readFileSync, writeFileSync } from "node:fs"
const p = "packages/dsh-vps/lib/client.js"
let s = readFileSync(p, "utf8")
s = s.replace("? 24h ?? ${fmtBytes(live[host.id].traffic.total)}", "? ?? ${fmtBytes(live[host.id].traffic.total)}")
s = s.replace("'24h ??'", "'????'")
writeFileSync(p, s, "utf8")
console.log("labels updated")
