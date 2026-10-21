import type { Readable } from 'node:stream'

export class BodyLimitError extends Error {
  constructor(public readonly status: number) { super(status === 413 ? 'Request body is too large.' : 'Request body is invalid or incomplete.') }
}

/** Counts actual bytes BEFORE JSON/multipart parsing. Declared length is only
 * an early rejection. Caller closes an over-limit request after sending 413. */
export function readBoundedBody(stream: Readable, contentLength: string | string[] | undefined, maxBytes: number, timeoutMs = 30_000): Promise<Buffer> {
  if (contentLength !== undefined && (typeof contentLength !== 'string' || !/^\d+$/.test(contentLength))) return Promise.reject(new BodyLimitError(400))
  const declared = contentLength === undefined ? null : Number(contentLength)
  if (declared !== null && (!Number.isSafeInteger(declared) || declared > maxBytes)) return Promise.reject(new BodyLimitError(413))
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    const cleanup = () => { clearTimeout(timer); stream.removeListener('data', data); stream.removeListener('end', end); stream.removeListener('error', fail); stream.removeListener('aborted', abort) }
    const fail = () => { cleanup(); stream.pause(); reject(new BodyLimitError(400)) }
    const abort = () => fail()
    const data = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
      size += bytes.byteLength
      if (size > maxBytes) { cleanup(); stream.pause(); reject(new BodyLimitError(413)); return }
      chunks.push(bytes)
    }
    const end = () => { cleanup(); if (declared !== null && declared !== size) reject(new BodyLimitError(400)); else resolve(Buffer.concat(chunks, size)) }
    const timer = setTimeout(fail, timeoutMs)
    stream.on('data', data); stream.once('end', end); stream.once('error', fail); stream.once('aborted', abort)
  })
}
