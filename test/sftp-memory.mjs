/**
 * Minimal in-memory SFTP server, enough for `fastPut`/`fastGet` (OPEN, WRITE,
 * READ, FSTAT, CLOSE) plus STAT/REALPATH. Used by the verification harness and
 * the standalone fake server so `vps_upload` / `vps_download` get real coverage
 * without needing a Linux box.
 */
const STATUS = { OK: 0, EOF: 1, NO_SUCH_FILE: 2, FAILURE: 4 }

/** Attach an in-memory SFTP subsystem to one accepted SSH session. */
export function attachSftp(session, files = new Map()) {
  session.on('sftp', (accept) => {
    const sftp = accept()
    let handleSeed = 0
    const handles = new Map()

    const openHandle = (path, flags) => {
      const wanted = typeof flags === 'number' ? flags : 0
      const readable = (wanted & 1) === 1 || (wanted & 2) === 2 // READ | WRITE
      if (!files.has(path) && (wanted & 2) !== 2 && (wanted & 1) === 1) {
        handles.set(handleSeed, { path, chunks: [], mode: 'r' })
        return { error: STATUS.NO_SUCH_FILE }
      }
      if (!files.has(path)) files.set(path, Buffer.alloc(0))
      const id = handleSeed++
      handles.set(id, { path, chunks: [], mode: (wanted & 2) === 2 ? 'w' : 'r' })
      const buffer = Buffer.alloc(4)
      buffer.writeUInt32BE(id, 0)
      return { handle: buffer }
    }

    const attrsOf = (path) => {
      const data = files.get(path)
      if (!data) return undefined
      return { mode: 0o100644, size: data.length, uid: 0, gid: 0, atime: Math.floor(Date.now() / 1000), mtime: Math.floor(Date.now() / 1000) }
    }

    sftp.on('OPEN', (reqid, filename, flags) => {
      const outcome = openHandle(filename, flags)
      if (outcome.error) sftp.status(reqid, outcome.error)
      else sftp.handle(reqid, outcome.handle)
    })

    sftp.on('WRITE', (reqid, handle, offset, data) => {
      const id = Buffer.isBuffer(handle) ? handle.readUInt32BE(0) : Number(handle)
      const record = handles.get(id)
      if (!record) {
        sftp.status(reqid, STATUS.FAILURE)
        return
      }
      const current = files.get(record.path) || Buffer.alloc(0)
      const needed = offset + data.length
      const next = current.length >= needed ? Buffer.from(current) : Buffer.concat([current, Buffer.alloc(needed - current.length)])
      data.copy(next, offset)
      files.set(record.path, next)
      sftp.status(reqid, STATUS.OK)
    })

    sftp.on('READ', (reqid, handle, offset, length) => {
      const id = Buffer.isBuffer(handle) ? handle.readUInt32BE(0) : Number(handle)
      const record = handles.get(id)
      const data = record ? files.get(record.path) : undefined
      if (!record || !data) {
        sftp.status(reqid, STATUS.FAILURE)
        return
      }
      if (offset >= data.length) {
        sftp.status(reqid, STATUS.EOF)
        return
      }
      sftp.data(reqid, data.subarray(offset, Math.min(offset + length, data.length)))
    })

    sftp.on('FSTAT', (reqid, handle) => {
      const id = Buffer.isBuffer(handle) ? handle.readUInt32BE(0) : Number(handle)
      const record = handles.get(id)
      const attrs = record && attrsOf(record.path)
      if (!attrs) sftp.status(reqid, STATUS.FAILURE)
      else sftp.attrs(reqid, attrs)
    })

    sftp.on('STAT', (reqid, path) => {
      const attrs = attrsOf(path)
      if (!attrs) sftp.status(reqid, STATUS.NO_SUCH_FILE)
      else sftp.attrs(reqid, attrs)
    })

    sftp.on('LSTAT', (reqid, path) => {
      const attrs = attrsOf(path)
      if (!attrs) sftp.status(reqid, STATUS.NO_SUCH_FILE)
      else sftp.attrs(reqid, attrs)
    })

    sftp.on('SETSTAT', (reqid) => sftp.status(reqid, STATUS.OK))
    sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, STATUS.OK))

    sftp.on('CLOSE', (reqid, handle) => {
      const id = Buffer.isBuffer(handle) ? handle.readUInt32BE(0) : Number(handle)
      handles.delete(id)
      sftp.status(reqid, STATUS.OK)
    })

    sftp.on('REALPATH', (reqid, path) => {
      sftp.name(reqid, [{ filename: path, longname: path, attrs: {} }])
    })

    sftp.on('OPENDIR', (reqid, path) => {
      const prefix = path.replace(/\/$/, '')
      const entries = [...files.keys()].filter((name) => name.startsWith(`${prefix}/`) && !name.slice(prefix.length + 1).includes('/'))
      const id = handleSeed++
      handles.set(id, { path, mode: 'dir', entries })
      const buffer = Buffer.alloc(4)
      buffer.writeUInt32BE(id, 0)
      sftp.handle(reqid, buffer)
    })

    sftp.on('READDIR', (reqid, handle) => {
      const id = Buffer.isBuffer(handle) ? handle.readUInt32BE(0) : Number(handle)
      const record = handles.get(id)
      if (!record?.entries?.length) {
        sftp.status(reqid, STATUS.EOF)
        return
      }
      const names = record.entries.splice(0, record.entries.length)
      sftp.name(
        reqid,
        names.map((name) => ({ filename: name.split('/').pop(), longname: name, attrs: attrsOf(name) || {} })),
      )
    })

    sftp.on('REMOVE', (reqid, path) => {
      files.delete(path)
      sftp.status(reqid, STATUS.OK)
    })

    sftp.on('MKDIR', (reqid) => sftp.status(reqid, STATUS.OK))
    sftp.on('RMDIR', (reqid) => sftp.status(reqid, STATUS.OK))
    sftp.on('RENAME', (reqid, from, to) => {
      const data = files.get(from)
      if (data) {
        files.set(to, data)
        files.delete(from)
      }
      sftp.status(reqid, STATUS.OK)
    })
  })
}
