import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = Lora({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Formation Pathways — Pacifica Christian",
  description:
    "Capture formation moments. Draft a Pathway. Keep AI behind the scenes.",
  // "Add to Home Screen" on iPhone opens full screen, titled "Capture".
  appleWebApp: { capable: true, title: "Capture", statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased">
        {children}
      </body>
    </html>
  );
}
