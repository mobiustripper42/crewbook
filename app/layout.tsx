import { Geist_Mono, Raleway } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { VersionTag } from "@/components/VersionTag"
import { cn } from "@/lib/utils"

const fontSans = Raleway({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata = {
  title: "BrewBoat",
  description: "Crew scheduler for brewboat operations.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontSans.variable, fontMono.variable)}
    >
      <body>
        <ThemeProvider>
          {children}
          {/* Phase 5 staff routes may add a bottom nav; nudge or hide there if so. */}
          <VersionTag className="fixed right-3 bottom-2 font-mono text-xs text-muted-foreground" />
        </ThemeProvider>
      </body>
    </html>
  )
}
