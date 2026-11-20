import type { Metadata } from "next";
import { connection } from "next/server";
import { keystoneContext } from "@/features/keystone/context";
import { Archivo, Bricolage_Grotesque, Geist, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Rider app type: Bricolage Grotesque for headings, prices and the wordmark; Instrument Sans for text.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The storefront is titled with the fleet riders book (the one the rider app shows); the dashboard sets its own title.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  let name = "";
  try {
    const fleet = await (keystoneContext as any).prisma.fleet.findFirst({ where: { status: "active", services: { some: { status: "active" } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { name: true } });
    name = fleet?.name?.trim() || "";
  } catch {}
  return { title: name || "Rideshare", description: name ? `Book a ride with ${name}.` : "Book a ride with a local fleet." };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="/favicon.svg" rel="icon" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} ${bricolage.variable} ${instrument.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
