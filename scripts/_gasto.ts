/**
 * Trava de gasto dos scripts de medição (simulações, benchmarks, placar, validadores).
 *
 * Importado antes de tudo em cada script. Sem `--pago` (ou PAGO=1) a chave da OpenRouter sai do ambiente do
 * processo: o que tem reserva na Featherless roda só nela, e o que depende da OpenRouter para e avisa. Rodar um
 * script deixa de gastar crédito por descuido; medir os modelos pagos de produção passa a ser um pedido explícito.
 * Os testes automáticos (`npm run test:*`) não chamam API nenhuma e não passam por aqui.
 */
const i = process.argv.indexOf("--pago");
if (i >= 0) process.argv.splice(i, 1);

/** O script foi chamado com `--pago` (ou PAGO=1): pode gastar crédito da OpenRouter e do ElevenLabs. */
export const pago = i >= 0 || process.env.PAGO === "1";

if (pago) {
  console.warn("[gasto] --pago: este script chama a OpenRouter e gasta crédito.");
} else if (process.env.OPENROUTER_API_KEY) {
  delete process.env.OPENROUTER_API_KEY;
  console.warn("[gasto] OpenRouter desligada neste script: roda só o que tem na Featherless. A produção pode usar a OpenRouter como reserva; tempos e contagens do script não representam esse fallback. Para medir com os modelos pagos: --pago");
}
