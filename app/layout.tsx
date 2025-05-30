import type React from "react"
import "@/app/globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "PY to EXE Online Generator | Convert Python to Executable",
  description:
    "Free online tool to convert Python (.py) files to executable (.exe) files. No installation required, just upload your Python script and download the executable.",
  keywords:
    "python to exe, py to exe, python converter, exe generator, online python compiler, python executable maker, convert py to exe online",
  authors: [{ name: "PY to EXE Team" }],
  creator: "PY to EXE Team",
  publisher: "PY to EXE Team",
  metadataBase: new URL("https://pytoexe.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PY to EXE Online Generator | Convert Python to Executable",
    description:
      "Free online tool to convert Python (.py) files to executable (.exe) files. No installation required, just upload your Python script and download the executable.",
    url: "https://pytoexe.vercel.app",
    siteName: "PY to EXE Online Generator",
    images: [
      {
        url: "/Python-Symbol.png",
        width: 800,
        height: 600,
        alt: "PY to EXE Online Generator",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PY to EXE Online Generator | Convert Python to Executable",
    description:
      "Free online tool to convert Python (.py) files to executable (.exe) files. No installation required, just upload your Python script and download the executable.",
    images: ["/Python-Symbol.png"],
  },
  icons: {
    icon: [{ url: "/favicon.png" }, { url: "/favicon.ico" }],
    apple: { url: "/apple-icon.png" },
    other: [
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        url: "/icon-192.png",
      },
    ],
  },
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Structured data for rich results */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "PY to EXE Online Generator",
              description: "Free online tool to convert Python (.py) files to executable (.exe) files.",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Windows",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
            }),
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
