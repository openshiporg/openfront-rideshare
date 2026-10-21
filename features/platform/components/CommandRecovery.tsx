'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { commandPrefix, executeDurableCommand, readCommand, type CommandIntent } from './durableCommand'

export function CommandRecovery({ actorId }: { actorId: string }) {
  const [commands, setCommands] = useState<CommandIntent[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)
  function load() {
    try {
      const rows: CommandIntent[] = []
      const prefix = `${commandPrefix}${encodeURIComponent(actorId)}:`
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(prefix) || key.includes(':history:')) continue
        const raw = localStorage.getItem(key)
        const resource = decodeURIComponent(key.slice(prefix.length))
        const value = readCommand(raw, actorId, resource)
        if (value?.phase === 'pending') rows.push(value)
      }
      setCommands(rows); setPage(0)
    } catch { setError('Some original commands cannot be read. Keep their stored data for reconciliation.') }
  }
  useEffect(() => { load(); window.addEventListener('storage', load); return () => window.removeEventListener('storage', load) }, [actorId])
  async function recover(command: CommandIntent) {
    if (busy) return
    setBusy(true); setError('')
    try { await executeDurableCommand(actorId, command.resource); load() }
    catch { setError('The original outcome is still unresolved. Current authority or assignment may have changed; do not create a replacement key.') }
    finally { setBusy(false) }
  }
  if (!actorId) return null
  return <section className="space-y-3 rounded-xl border p-4" data-command-pending={commands.length > 0 || busy ? 'true' : undefined}><h2 className="font-medium">Original command recovery</h2><Button type="button" size="sm" variant="outline" onClick={load} disabled={busy}>Refresh saved commands</Button>{commands.slice(page * 25, (page+1)*25).map(command => <div key={command.key} className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="break-all">{command.purpose} · {command.resource}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void recover(command)}>Recover original command</Button></div>)}{commands.length > 25 && <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0 || busy} onClick={() => setPage(v=>v-1)}>Previous</Button><Button type="button" variant="outline" size="sm" disabled={(page+1)*25 >= commands.length || busy} onClick={() => setPage(v=>v+1)}>Next</Button></div>}{!commands.length && <p className="text-xs text-muted-foreground">No unresolved commands for this account in this browser.</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</section>
}
