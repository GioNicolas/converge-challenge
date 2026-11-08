import { redirect } from "next/navigation";

/** A criação de vagas vive em /vagas/nova. */
export default function Page() {
  redirect("/vagas/nova");
}
