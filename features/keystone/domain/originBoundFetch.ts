export function createOriginBoundFetch(endpoint: URL, cookie: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = new URL(input instanceof Request ? input.url : String(input), endpoint)
    if (target.origin !== endpoint.origin || target.pathname !== endpoint.pathname) {
      throw new Error('MCP transport refused a request outside its configured endpoint.')
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    if (cookie) headers.set('cookie', cookie)
    return fetchImpl(input, { ...init, headers, redirect: 'manual' })
  }
}
