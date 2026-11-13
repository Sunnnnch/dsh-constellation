import { createHash } from "node:crypto"
import { statSync } from "node:fs"
const s = statSync("packages/dsh-vps/lib/client.js")
const hash = createHash("sha1").update("plugin-artifact").update("\0")
for (const part of [String(s.mtimeMs), String(s.ctimeMs), String(s.size)]) {
  hash.update(`${Buffer.byteLength(part)}:${part}`)
}
console.log(hash.digest("hex").slice(0, 12))
