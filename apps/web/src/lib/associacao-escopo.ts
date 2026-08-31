/**
 * Carteirinha é da torcida (worktree), não da unidade.
 *
 * `SaasMembro` / `SaasSocio` são por tenant. Quem se associa numa unidade
 * Caso B ganha espelho na Sede; o inverso não existe — sócio direto da Sede
 * não tem linha nas PDEs. Sem este recorte, `/portal/carteirinha` no canal
 * da unidade cai em "Sem carteirinha" mesmo com vínculo aprovado na raiz.
 *
 * Puro (sem banco) para o teste da regra. A resolução com worktree mora em
 * `associacao-escopo-server.ts`.
 */

export type SocioCarteirinhaWorktree = {
  tenantId: string
  espelhado: boolean
}

/**
 * Escolhe o tenant cuja carteirinha vale nesta worktree.
 *
 * 1. Vínculo SOCIO APROVADO no canal atual (origem ou espelho).
 * 2. Senão, o da Sede raiz — a carteirinha da torcida.
 * 3. Senão, o canônico (`espelhado: false`) em outra unidade da linhagem.
 * 4. Sem sócio na worktree, fica no tenant atual (torcedor / pendente / vazio).
 */
export function escolherTenantCarteirinha(opts: {
  tenantAtualId: string
  raizId: string
  sociosAprovados: readonly SocioCarteirinhaWorktree[]
}): string {
  const { tenantAtualId, raizId, sociosAprovados } = opts
  if (sociosAprovados.length === 0) return tenantAtualId
  if (sociosAprovados.some((s) => s.tenantId === tenantAtualId)) return tenantAtualId
  if (sociosAprovados.some((s) => s.tenantId === raizId)) return raizId
  const canonico = sociosAprovados.find((s) => !s.espelhado)
  return canonico?.tenantId ?? sociosAprovados[0]!.tenantId
}
