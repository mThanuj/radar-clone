import type { Metadata, Viewport } from "next";
// The `geist` package self-hosts the font files. next/font/google would try
// to reach fonts.googleapis.com at build time, which the corp proxy blocks.
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Radar",
    template: "%s · Radar",
  },
  description: "Issue tracking",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let people zoom. Locking it out is an accessibility problem, and nothing
  // here depends on the viewport staying put.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full">
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
