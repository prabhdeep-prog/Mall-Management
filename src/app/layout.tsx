import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { SessionProvider } from "@/components/providers/session-provider"
import { ThemeProvider } from "@/components/providers/theme-provider"

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" })

export const metadata: Metadata = {
  title: "Mall Management Platform - AI-Powered Operations",
  description: "Agentic mall management platform with AI-powered operations, tenant relations, and financial intelligence",
}

/**
 * Anti-FOUC script — runs before React hydration.
 * Reads localStorage "theme" and applies the "dark" class immediately
 * so there is zero flash between server render and client paint.
 */
const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('theme');
    var preferred = (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches));
    if (preferred) document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', preferred ? 'dark' : 'light');
  } catch(e) {}
})();
`.trim()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Anti-FOUC: apply theme class before first paint */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <SessionProvider>
            {children}
            <Toaster />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
