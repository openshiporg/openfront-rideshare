import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PlatformEmpty, PlatformSection } from '@/features/platform/components/PlatformPage'
import { formatPaymentAmount } from '../domain/pagination'
import { formatEngaged, type DriverEarningsReport } from '../domain/driverEarnings'
import { EarningsCsvButton } from './EarningsCsvButton'

const QUERY = `query DriverEarnings($from: String, $to: String) { driverEarningsReport(from: $from, to: $to) }`
const day = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined)

/** Per-driver earnings statement for a period, with CSV export for payroll or settlement. */
export async function DriverEarningsSection({ from, to }: { from?: string; to?: string }) {
  const response = await keystoneClient(QUERY, { from: day(from) ?? null, to: day(to) ?? null })
  const report: DriverEarningsReport | null = response.success ? response.data?.driverEarningsReport ?? null : null
  const error = response.success ? null : response.error.replace(/^.*?Error:\s*/, '')
  const totals = report?.drivers.reduce((sum, row) => ({ trips: sum.trips + row.trips, gross: sum.gross + row.faresMinor + row.feesMinor }), { trips: 0, gross: 0 })
  const currency = report?.drivers[0]?.currencyCode || 'USD'
  return <PlatformSection id="driver-earnings" title="Driver earnings" meta={report ? `${report.from} – ${report.to}` : undefined} actions={report ? <EarningsCsvButton report={report} /> : undefined}>
    <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
      <label className="space-y-1"><span className="block text-xs text-muted-foreground">From</span><input type="date" name="from" defaultValue={report?.from ?? day(from)} className="h-8 rounded-[4px] bg-background px-2 ring-1 ring-foreground/10" /></label>
      <label className="space-y-1"><span className="block text-xs text-muted-foreground">To</span><input type="date" name="to" defaultValue={report?.to ?? day(to)} className="h-8 rounded-[4px] bg-background px-2 ring-1 ring-foreground/10" /></label>
      <button type="submit" className="h-8 rounded-[4px] px-3 ring-1 ring-foreground/10 hover:bg-muted">Show</button>
    </form>
    {error ? <p role="alert" className="text-sm text-destructive">{/access|authentication/i.test(error) ? 'Finance access is required to see driver earnings.' : error}</p>
      : !report || !report.drivers.length ? <PlatformEmpty>No completed trips in this period</PlatformEmpty>
      : <>
      <ul className="divide-y rounded-[6px] border sm:hidden">{report.drivers.map(row => <li key={`${row.driverId}:${row.currencyCode}`} className="space-y-2 p-3 text-sm tabular-nums">
        <div className="flex items-baseline justify-between gap-3"><span className="font-medium">{row.driverName}</span><span className="text-muted-foreground">{row.trips} {row.trips === 1 ? 'trip' : 'trips'}{row.onTripSeconds ? ` · ${formatEngaged(row.onTripSeconds)} engaged` : ''}</span></div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {([['Fares', row.faresMinor], ['Fees', row.feesMinor], ['Charged', row.collectedMinor], ['Refunded', row.refundedMinor], ['Net received', Math.max(0, row.collectedMinor - row.refundedMinor)], ['Outstanding', row.uncollectedMinor]] as const).map(([label, value]) => <div key={label} className="flex justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd>{formatPaymentAmount(value, row.currencyCode)}</dd></div>)}
        </dl>
      </li>)}</ul>
      <div className="hidden overflow-x-auto rounded-[6px] border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>
            <th className="px-3 py-2 font-medium">Driver</th><th className="px-3 py-2 text-right font-medium">Trips</th><th className="px-3 py-2 text-right font-medium">Engaged</th>
            <th className="px-3 py-2 text-right font-medium">Fares</th><th className="px-3 py-2 text-right font-medium">Fees</th><th className="px-3 py-2 text-right font-medium">Charged</th>
            <th className="px-3 py-2 text-right font-medium">Refunded</th><th className="px-3 py-2 text-right font-medium">Net received</th><th className="px-3 py-2 text-right font-medium">Outstanding</th>
          </tr></thead>
          <tbody className="divide-y">{report.drivers.map(row => <tr key={`${row.driverId}:${row.currencyCode}`} className="tabular-nums">
            <td className="px-3 py-2 font-medium">{row.driverName}</td><td className="px-3 py-2 text-right">{row.trips}</td><td className="px-3 py-2 text-right">{formatEngaged(row.onTripSeconds)}</td>
            <td className="px-3 py-2 text-right">{formatPaymentAmount(row.faresMinor, row.currencyCode)}</td><td className="px-3 py-2 text-right">{formatPaymentAmount(row.feesMinor, row.currencyCode)}</td>
            <td className="px-3 py-2 text-right">{formatPaymentAmount(row.collectedMinor, row.currencyCode)}</td><td className="px-3 py-2 text-right">{formatPaymentAmount(row.refundedMinor, row.currencyCode)}</td><td className="px-3 py-2 text-right">{formatPaymentAmount(Math.max(0, row.collectedMinor - row.refundedMinor), row.currencyCode)}</td>
            <td className="px-3 py-2 text-right">{formatPaymentAmount(row.uncollectedMinor, row.currencyCode)}</td>
          </tr>)}</tbody>
          {totals && <tfoot className="border-t text-xs text-muted-foreground"><tr><td className="px-3 py-2" colSpan={9}>{totals.trips} completed {totals.trips === 1 ? 'trip' : 'trips'} · {formatPaymentAmount(totals.gross, currency)} gross{report.truncated ? ' · showing the first 5,000 trips; narrow the range' : ''}. Charged includes card and recorded payments, also prepaid fares on rides later cancelled. Outstanding is cash in the driver’s hand or still owed. Engaged is from heading to the pickup until drop-off.</td></tr></tfoot>}
        </table>
      </div>
      {totals && <p className="text-xs text-muted-foreground sm:hidden">{totals.trips} completed {totals.trips === 1 ? 'trip' : 'trips'} · {formatPaymentAmount(totals.gross, currency)} gross{report.truncated ? ' · showing the first 5,000 trips; narrow the range' : ''}. Charged includes card and recorded payments, also prepaid fares on rides later cancelled. Outstanding is cash in the driver’s hand or still owed. Engaged is from heading to the pickup until drop-off.</p>}
      </>}
  </PlatformSection>
}
