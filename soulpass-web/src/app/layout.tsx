import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/lib/providers";
import { validateEnv } from "@/lib/env";

// Run env validation at module load so misconfigured deploys fail loud during
// the first SSR render (production) or log a warning (dev).
validateEnv();

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SoulPass — Web2 simplicity. Web3 permanence.",
    template: "%s · SoulPass",
  },
  description:
    "The reputation layer for real-world communities. Turn every event attendance and every handshake into permanent on-chain proof. Built on Solana.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://soulpass.xyz"),
  applicationName: "SoulPass",
  openGraph: {
    title: "SoulPass",
    description: "Your reputation. Your badges. Your proof. Forever on Solana.",
    type: "website",
    siteName: "SoulPass",
  },
  twitter: {
    card: "summary_large_image",
    title: "SoulPass",
    description: "Your reputation. Your badges. Your proof. Forever on Solana.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: "#0B0D11",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
