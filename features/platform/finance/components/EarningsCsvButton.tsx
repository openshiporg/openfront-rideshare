'use client'

import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { driverEarningsCsv, type DriverEarningsReport } from '../domain/driverEarnings'

export function EarningsCsvButton({ report }: { report: DriverEarningsReport }) {
  return <ActionTrack><TrackButton tone="default" disabled={!report.drivers.length} onClick={() => {
    const blob = new Blob([driverEarningsCsv(report)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `driver-earnings-${report.from}-to-${report.to}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }}>Download CSV</TrackButton></ActionTrack>
}
