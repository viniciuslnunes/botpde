/**
 * Quando o viewer **não** é sócio aprovado do tenant, o feed/busca pode
 * expandir para as outras TOs da mesma afiliação (coirmãs / praça do clube).
 *
 * Isso é o path do torcedor e da Comunidade Nacional. Fora dele, expandir
 * mistura Camisa 12 no mural da PDE — e o operador (super-admin sem vínculo)
 * navega a torcida selecionada, não a praça nacional.
 *
 * Rivais **nunca** entram por este caminho: coirmãs compartilham `afiliacaoId`;
 * rival isolante é outro clube (`ESCOPOS_RIVALIDADE_ISOLANTE`).
 */
export function expandirCoirmasNoFeed(opts: {
  membroAprovado: boolean
  tenantSintetico: boolean
  superAdmin: boolean
}): boolean {
  if (opts.membroAprovado) return false
  // CN: ninguém tem SaasMembro no sintético — as TOs da afiliação SÃO o escopo.
  if (opts.tenantSintetico) return true
  // Operador lê a malha desta TO (hierarquia + aliados), igual ao sócio.
  if (opts.superAdmin) return false
  return true
}
