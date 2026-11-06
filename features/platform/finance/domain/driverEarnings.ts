// Client-safe shape and CSV writer for the finance driver earnings report.
export type DriverEarningsRow = {
  driverId: string; driverName: string; currencyCode: string; trips: number; onTripSeconds: number
  faresMinor: number; feesMinor: number; collectedMinor: number; refundedMinor: number; uncollectedMinor: number
}
export type DriverEarningsReport = { from: string; to: string; truncated: boolean; drivers: DriverEarningsRow[] }

export function driverEarningsCsv(report: DriverEarningsReport) {
  const cell = (value: unknown) => {
    const text = String(value ?? '')
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const minor = (value: number) => (value / 100).toFixed(2)
  const header = ['Driver', 'Currency', 'Completed trips', 'Hours on trip', 'Fares', 'Cancellation and no-show fees', 'Gross', 'Charged', 'Refunded', 'Net received', 'Outstanding (cash or owed)']
  const lines = report.drivers.map(row => [
    row.driverName, row.currencyCode, row.trips, (row.onTripSeconds / 3600).toFixed(2), minor(row.faresMinor), minor(row.feesMinor), minor(row.faresMinor + row.feesMinor),
    minor(row.collectedMinor), minor(row.refundedMinor), minor(row.collectedMinor - row.refundedMinor), minor(row.uncollectedMinor),
  ])
  return [header, ...lines].map(line => line.map(cell).join(',')).join('\r\n') + '\r\n'
}
