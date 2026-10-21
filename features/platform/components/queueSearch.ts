export function parseQueueSearch(value: string | string[] | undefined) {
  if (value === undefined) return { query: '', issue: '' }
  if (typeof value !== 'string' || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) return { query: '', issue: 'Use one search reference of at most 100 characters.' }
  return { query: value.trim(), issue: '' }
}

export function queueSearchHref(href: string, query: string) {
  const params = new URLSearchParams(href.slice(1))
  if (query) params.set('q', query)
  return `?${params}`
}
