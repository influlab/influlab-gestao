import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "InfluLAB — Gestão Financeira",
  description: "Painel de gestão financeira da InfluLAB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} h-full`}>
      <body className="h-full bg-gray-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
