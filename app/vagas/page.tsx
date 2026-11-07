import { Suspense } from "react";
import Workspace from "@/components/vagas/Workspace";

export default function Page() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
