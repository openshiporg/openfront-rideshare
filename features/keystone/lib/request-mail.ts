import { createTransport } from "nodemailer";
import type { RequestReceivedMail } from "./request-confirmation";
import { emailButton, emailLayout, emailMuted, emailPanel, emailParagraph, escapeHtml } from "./email-layout"


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
      html: emailLayout({
        storeName: mail.fleetName,
        preheader: `Ride request ${mail.requestNumber} received`,
        title: "We received your ride request",
        body: `${emailParagraph(`Thanks ${escapeHtml(mail.name)}. Request <strong>${escapeHtml(mail.requestNumber)}</strong> with ${escapeHtml(mail.fleetName)}.`)}
${emailPanel(`${escapeHtml(mail.whenLabel)}<br>From: ${escapeHtml(mail.pickup)}<br>To: ${escapeHtml(mail.dropoff)}`)}
${emailMuted("We will show your driver once one accepts.")}
${emailButton("View your rides", mail.link)}`,
      }),
    });
    return { sent: true, messageId: typeof (info as any)?.messageId === "string" ? (info as any).messageId : undefined, response: typeof (info as any)?.response === "string" ? (info as any).response : undefined };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "send_failed" };
  }
}
