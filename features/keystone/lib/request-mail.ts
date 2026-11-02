import { createTransport } from "nodemailer";
import type { RequestReceivedMail } from "./request-confirmation";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

function transport() {
  const port = Number(process.env.SMTP_PORT);
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Email delivery is not configured");
  return createTransport({ host: process.env.SMTP_HOST, port, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
}

export async function sendRequestReceivedEmail(mail: RequestReceivedMail): Promise<{ sent: boolean; error?: string; messageId?: string; response?: string }> {
  try {
    const info = await transport().sendMail({
      to: mail.to,
      from: process.env.SMTP_FROM,
      subject: `Ride request ${mail.requestNumber} received by ${mail.fleetName}`,
      html: `<body style="font-family:Helvetica,Arial,sans-serif;color:#222;max-width:560px;margin:auto">
        <h2>Thanks ${escapeHtml(mail.name)}, we received your ride request</h2>
        <p>Request <strong>${escapeHtml(mail.requestNumber)}</strong> with ${escapeHtml(mail.fleetName)}.<br/>${escapeHtml(mail.whenLabel)}</p>
        <p>From: ${escapeHtml(mail.pickup)}<br/>To: ${escapeHtml(mail.dropoff)}</p>
        <p>We will show your driver once one accepts.</p>
        <p><a href="${escapeHtml(mail.link)}">View your rides</a></p>
      </body>`,
    });
    return { sent: true, messageId: typeof (info as any)?.messageId === "string" ? (info as any).messageId : undefined, response: typeof (info as any)?.response === "string" ? (info as any).response : undefined };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "send_failed" };
  }
}
