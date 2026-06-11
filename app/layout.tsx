import type { Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers/Providers";
import { metadata as siteMetadata, jsonLd } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = siteMetadata;

export const viewport: Viewport = {
  themeColor: "#0a0b0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(archivo.variable, jetbrainsMono.variable)}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:bg-accent focus:px-4 focus:py-2 focus:font-mono focus:text-small focus:uppercase focus:tracking-wider focus:text-paper"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
