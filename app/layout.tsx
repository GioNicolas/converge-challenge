import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Três famílias com papéis fixos (sistema de design do Totti):
// Bricolage Grotesque = títulos e números · Inter = interface e leitura · JetBrains Mono = a voz da máquina.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
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
      <body className={`${inter.variable} ${bricolage.variable} ${jetbrains.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
