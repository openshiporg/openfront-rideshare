'use client'

import Link from 'next/link'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useOnboardingApi } from '../hooks/useOnboardingApi'

export default function OnboardingDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'minimal' | 'full'>('full')
  const { runOnboarding, isLoading, error, result } = useOnboardingApi()
  const summary = result?.summary ?? {}
  const missing: string[] = Array.isArray(summary.missing) ? summary.missing.filter((item: unknown): item is string => typeof item === 'string') : []
  const title = summary.setupComplete === true
    ? 'Sample setup structure checked'
    : result?.created === true
      ? 'Setup saved; requirements remain'
      : 'Setup requirements remain'

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open && !isLoading) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up Openfront Rideshare</DialogTitle>
          <DialogDescription>
            Set up sample services and a driver. Sample evidence does not authorize real rides.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{summary.setupComplete === true ? 'Sample records are structurally complete. Real operations still require verified providers and admission.' : 'Review the remaining requirements below.'}</p>
            {missing.length > 0 && (
              <div>
                <p className="text-sm font-medium">Missing or unverified</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {missing.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Sample evidence is not licensing, insurance, provider approval or driver admission.
            </p>
            <div className="flex flex-wrap gap-2"><Button disabled={isLoading} className="mt-2" onClick={() => void runOnboarding(mode)}>Check existing setup</Button><Button variant="outline" asChild><Link href="/dashboard/platform/settings">Open fleet settings</Link></Button></div>
          </div>
        ) : (
          <>
            <RadioGroup value={mode} disabled={isLoading} onValueChange={value => { if (!isLoading && (value === 'minimal' || value === 'full')) setMode(value) }} aria-label="Setup template" className="grid grid-cols-2 gap-3">{(['minimal','full'] as const).map(value => <Label key={value} htmlFor={`setup-${value}`} className="flex items-start gap-3 rounded-lg border p-4"><RadioGroupItem id={`setup-${value}`} value={value} /><span><span className="font-medium capitalize">{value}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{value === 'minimal' ? 'One sample service.' : 'Standard and accessible samples.'}</span></span></Label>)}</RadioGroup>
            <Button disabled={isLoading} onClick={() => runOnboarding(mode)}>
              {isLoading ? 'Saving sample setup…' : 'Continue sample setup'}
            </Button>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
