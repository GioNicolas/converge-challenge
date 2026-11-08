import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Três famílias com papéis fixos (sistema de design do Totti):
// Fraunces = títulos e números (serifa quente, eixo SOFT) · Inter = interface e leitura · JetBrains Mono = a voz da máquina.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Totti — Entrevista técnica",
  description: "Entrevista técnica com um agente de voz que desenha no quadro.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
