// "Ride request received" email, sent AFTER the request transaction has committed.
// The Notification row (unique idempotencyKey per request) is the dedupe record and carries the status.
// Guests give no email in this flow (they hold a receipt proof only), so only a signed-in rider is mailed;
// a guest request is recorded as skipped_no_recipient. The email links the rider's own account rides page.

export type RequestReceivedMail = { to: string; fleetName: string; requestNumber: string; name: string; whenLabel: string; pickup: string; dropoff: string; link: string };
type Send = (mail: RequestReceivedMail) => Promise<{ sent: boolean; error?: string }>;

export function requestConfirmationConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_STORE_LINK);
}

export async function deliverRequestReceived(prisma: any, requestId: string, send?: Send) {
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
        data: { recipientId: request.riderId || null, channel: "email", templateKey: "ride_request_received", status: "sending", payload: { requestId: request.id, requestNumber: request.requestNumber }, idempotencyKey: `ride-request-received:${request.id}` },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") return; // already claimed: replay or concurrent submit
      throw error;
    }
    const mark = (status: string, error?: string) => prisma.notification.update({ where: { id: row.id }, data: { status, attemptCount: { increment: 1 }, ...(status === "sent" ? { sentAt: new Date() } : {}), ...(error ? { lastError: error.slice(0, 200) } : {}) } });
    try {
      const email = request.rider?.email;
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
        link: `${String(process.env.SMTP_STORE_LINK).replace(/\/$/, "")}/account/rides`,
      });
      await (result.sent ? mark("sent") : mark("failed", result.error || "send_failed"));
    } catch (error) {
      try { await mark("failed", error instanceof Error ? error.message : "send_failed"); } catch { /* the request is committed; bookkeeping must never surface */ }
    }
  } catch (error) {
    console.error("Ride request confirmation bookkeeping failed:", error instanceof Error ? error.message : "unknown");
  }
}
