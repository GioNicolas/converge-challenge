// Conversor mínimo Zod 3 -> JSON Schema, no modo estrito dos provedores (todas as propriedades
// obrigatórias, additionalProperties: false). Cobre só o que os esquemas do cérebro usam.
// `.default()` e `.optional()` viram campo obrigatório: o modelo sempre preenche, e o Zod
// aplica os defaults depois, na validação.
import { z, type ZodTypeAny } from "zod";

export type JsonSchema = Record<string, unknown>;

export function paraJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName?: string } & Record<string, unknown>;
  switch (def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodNumber": {
      const inteiro = (def.checks as { kind: string }[] | undefined)?.some((c) => c.kind === "int");
      return { type: inteiro ? "integer" : "number" };
    }
    case "ZodLiteral":
      return { const: def.value };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodArray":
      return { type: "array", items: paraJsonSchema(def.type as ZodTypeAny) };
    case "ZodNullable":
      return { anyOf: [paraJsonSchema(def.innerType as ZodTypeAny), { type: "null" }] };
    case "ZodOptional":
    case "ZodDefault":
      return paraJsonSchema(def.innerType as ZodTypeAny);
    case "ZodEffects":
      return paraJsonSchema(def.schema as ZodTypeAny);
    case "ZodObject": {
      const forma = (schema as z.AnyZodObject).shape as Record<string, ZodTypeAny>;
      return {
        type: "object",
        properties: Object.fromEntries(Object.entries(forma).map(([k, v]) => [k, paraJsonSchema(v)])),
        required: Object.keys(forma),
        additionalProperties: false,
      };
    }
    default:
      throw new Error(`paraJsonSchema: tipo Zod sem suporte (${def.typeName})`);
  }
}
