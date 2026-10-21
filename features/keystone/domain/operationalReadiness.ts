/** Server-owned readiness. Installed rows are not evidence of a contracted
 * route, eligibility, communications or money capability. */
export function rideReadiness() {
  const preview = process.env.NODE_ENV !== 'production'
  return {
    bookingEnabled: preview,
    mode: preview ? 'preview' : 'unavailable',
    reason: preview ? 'Preview only. Routes and driver availability are unverified; no payment is collected.' : 'Online booking is unavailable. Existing ride receipts and account history remain accessible.',
  }
}
