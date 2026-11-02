// "Ride request received" email, sent AFTER the request transaction has committed.
// The Notification row (unique idempotencyKey per request) is the dedupe record and carries the status.
// Recipient: the optional "Email for receipt" the guest typed (kept only on this Notification's payload, never on
// the request, and linked to no account), else a signed-in rider's own email. With neither: skipped_no_recipient.
// Link: a signed-in rider's own rides page, else the guest's receipt link (home page + URL-fragment receipt, so the
// proof is never sent to a server or logged). The proof is passed in memory and never stored.

export type RequestReceivedMail = { to: string; fleetName: string; requestNumber: string; name: string; whenLabel: string; pickup: string; dropoff: string; link: string };
type Send = (mail: RequestReceivedMail) => Promise<{ sent: boolean; error?: string }>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The optional "Email for receipt": trimmed, lower-cased, validated. Empty means none. */
export function normalizeReceiptEmail(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('Enter a valid email address.')
  const email = value.trim().toLowerCase()
  if (!email) return null
  if (email.length > 254 || !EMAIL.test(email)) throw new Error('Enter a valid email address.')
  return email
}

export type ReceiptExtra = { receiptEmail?: string | null; requestProof?: string | null }

export function requestConfirmationConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_STORE_LINK);
}

function receiptLink(request: { id: string; requestNumber: string; riderId: string | null }, extra: ReceiptExtra) {
  const base = String(process.env.SMTP_STORE_LINK).replace(/\/$/, "")
  if (request.riderId || !extra.requestProof) return `${base}/account/rides`
  const hash = new URLSearchParams({ r: request.id, n: request.requestNumber, p: extra.requestProof })
  return `${base}/#receipt=${hash.toString()}`
}

export async function deliverRequestReceived(prisma: any, requestId: string, send?: Send, extra: ReceiptExtra = {}) {
  try {
    const request = await prisma.rideRequest.findUnique({
      where: { id: requestId },
      select: { id: true, riderId: true, requestNumber: true, requestedFor: true, pickupLabel: true, dropoffLabel: true,
        fleet: { select: { name: true, timezone: true } }, rider: { select: { email: true, name: true } } },
    });
    if (!request) return;
    let row: any;
    try {
      row = await prisma.notification.create({
        data: { recipientId: request.riderId || null, channel: "email", templateKey: "ride_request_received", status: "sending", payload: { requestId: request.id, requestNumber: request.requestNumber, ...(extra.receiptEmail ? { receiptEmail: extra.receiptEmail } : {}) }, idempotencyKey: `ride-request-received:${request.id}` },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") return; // already claimed: replay or concurrent submit
      throw error;
    }
    const mark = (status: string, error?: string) => prisma.notification.update({ where: { id: row.id }, data: { status, attemptCount: { increment: 1 }, ...(status === "sent" ? { sentAt: new Date() } : {}), ...(error ? { lastError: error.slice(0, 200) } : {}) } });
    try {
      const email = extra.receiptEmail || request.rider?.email;
      if (!email) { await mark("skipped_no_recipient"); return; }
      if (!requestConfirmationConfigured()) { await mark("skipped_not_configured"); return; }
      const zone = request.fleet?.timezone || "UTC";
      const whenLabel = request.requestedFor
        ? `Scheduled for ${new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(request.requestedFor))}`
        : "As soon as a driver is available";
      // Loaded lazily so the mail module never joins the keystone import graph at build time.
      const sender = send || (await import("./request-mail")).sendRequestReceivedEmail;
      const result = await sender({
        to: email, fleetName: request.fleet?.name || "Your ride service", requestNumber: request.requestNumber, name: request.rider?.name || "there", whenLabel,
        pickup: request.pickupLabel, dropoff: request.dropoffLabel,
        link: receiptLink(request, extra),
      });
      await (result.sent ? mark("sent") : mark("failed", result.error || "send_failed"));
    } catch (error) {
      try { await mark("failed", error instanceof Error ? error.message : "send_failed"); } catch { /* the request is committed; bookkeeping must never surface */ }
    }
  } catch (error) {
    console.error("Ride request confirmation bookkeeping failed:", error instanceof Error ? error.message : "unknown");
  }
}
