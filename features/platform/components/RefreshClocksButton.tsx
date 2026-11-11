'use client'

import { TransitionTrack } from './SetupSheet'
import { ops } from '../setup/setupMutations'

/** Staff button: expires unserved ride requests, re-checks refunds stuck in processing and purges old locations now. */
export function RefreshClocksButton() {
  return <TransitionTrack label="Refresh clocks" actions={[{ label: 'Refresh', run: () => ops.refreshClocks() }]} />
}
