import type { Metadata } from "next";
import TemaRecrutador from "@/components/TemaRecrutador";

export const metadata: Metadata = {
  title: "Como funciona",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <TemaRecrutador>{children}</TemaRecrutador>;
}
