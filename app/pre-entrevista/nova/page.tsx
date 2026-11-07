import type { Metadata } from "next";
import PreEntrevistaTotti from "@/components/pre-entrevista/PreEntrevistaTotti";

export const metadata: Metadata = {
  title: "Nova entrevista · Converge",
};

export default function Page() {
  return <PreEntrevistaTotti />;
}
