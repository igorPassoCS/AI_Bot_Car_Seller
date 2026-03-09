import type { Metadata } from "next";
import { Space_Grotesk, Sora } from "next/font/google";
import "./globals.css";

const titleFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-title",
  display: "swap"
});

const bodyFont = Sora({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Car Search Consultant",
  description: "Busca inteligente de carros com agente Mastra."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${titleFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
