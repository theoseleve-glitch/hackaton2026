import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-fraunces" });
const inter = Inter({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "L'Échappée — Le GPS des routes qui respirent",
  description: "Le détour est la destination. Trouve les plus belles haltes sur ta route : producteurs, marchés, villages, points de vue.",
  openGraph: { title: "L'Échappée", description: "Le GPS des routes qui respirent.", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <a href="#contenu" className="skip">Aller au contenu</a>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
