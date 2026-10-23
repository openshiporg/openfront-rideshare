'use client'
import { useEffect, useState } from 'react'
import { ActionTrack, TrackButton } from './PillTabs'
import { StatusTitle } from './StatusTitle'
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
    } catch { setError('Some saved commands are unreadable.') }
  }
  useEffect(() => { load(); window.addEventListener('storage', load); return () => window.removeEventListener('storage', load) }, [actorId])
  async function recover(command: CommandIntent) {
    if (busy) return
    setBusy(true); setError('')
    try { await executeDurableCommand(actorId, command.resource); load() }
    catch { setError('Still unconfirmed. Access or assignment may have changed.') }
    finally { setBusy(false) }
  }
  if (!actorId || (!commands.length && !error)) return null
  const purpose = { offer: 'Offer', transition: 'Trip update', cancel: 'Cancellation' }
  return <section aria-label="Unconfirmed commands" className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4" data-command-pending={commands.length > 0 || busy ? 'true' : undefined}>
    <div className="flex flex-wrap items-center justify-between gap-2"><StatusTitle as="h2" tone="amber" status={`${commands.length}`} className="text-sm font-semibold">Unconfirmed commands</StatusTitle><ActionTrack><TrackButton onClick={load} disabled={busy}>Reload</TrackButton></ActionTrack></div>
    {commands.length > 0 && <ul className="divide-y rounded-lg border bg-background">{commands.slice(page * 25, (page + 1) * 25).map(command => <li key={command.key} className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><span className="min-w-0 break-all"><span className="font-medium">{purpose[command.purpose]}</span> <span className="font-mono text-xs text-muted-foreground">{command.resource}</span></span><ActionTrack><TrackButton tone="primary" disabled={busy} onClick={() => void recover(command)}>Recover</TrackButton></ActionTrack></li>)}</ul>}
    {commands.length > 25 && <ActionTrack label="Command pages"><TrackButton disabled={page === 0 || busy} onClick={() => setPage(v => v - 1)}>Previous</TrackButton><TrackButton disabled={(page + 1) * 25 >= commands.length || busy} onClick={() => setPage(v => v + 1)}>Next</TrackButton></ActionTrack>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
