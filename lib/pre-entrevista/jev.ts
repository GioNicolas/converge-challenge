/**
 * Cliente do Jev (TypeSafe AI) — modelo de classificação usado na pré-entrevista.
 * Lê a chave de `TYPESAFE_API_KEY`. Só roda no servidor.
 */
import { TypeSafeClient } from "@typesafe-ai/sdk";

let client: TypeSafeClient | undefined;

export function jev(): TypeSafeClient {
  client ??= new TypeSafeClient({ defaultModel: "jev-latest" });
  return client;
}
