import { db, Prisma } from '@torcida/db'

/**
 * Hard delete de um cadastro, compartilhado pela Server Action do admin do
 * tenant (`apagarMembroDefinitivo`) e pela rota do super-admin. Os dois gates
 * são diferentes — `members:purge` vs. allowlist de e-mail — mas a semântica da
 * remoção precisa ser a MESMA, senão uma das portas deixa lixo para trás.
 *
 * Preserva `AuditLog` e `MembroBloqueio` de propósito: o rastro da decisão tem
 * de sobreviver ao registro, e apagar o cadastro não pode virar a porta dos
 * fundos para quem está bloqueado voltar a se inscrever.
 */
export type MembroParaPurge = {
  id: string
  tenantId: string
  userId: string
  nome: string
  tipo: string
  status: string
  espelhado: boolean
  desligadoEm: Date | null
  numeroAssociado: string | null
}

export const membroPurgeSelect = {
  id: true,
  tenantId: true,
  userId: true,
  nome: true,
  tipo: true,
  status: true,
  espelhado: true,
  desligadoEm: true,
  numeroAssociado: true,
} as const

/**
 * Regra de negócio única: só sai de vez quem já saiu da operação. Cadastro
 * ativo não some por acidente — para tirar alguém de dentro o caminho é
 * desligar (`members:dismiss`), que é outra decisão e outro log.
 */
export function motivoImpedeApagar(membro: MembroParaPurge): string | null {
  if (membro.espelhado) {
    return 'Este registro é um espelho da Sede. Apague na unidade de origem.'
  }
  if (membro.status !== 'REPROVADO' && !membro.desligadoEm) {
    return 'Só é possível apagar cadastros reprovados ou desligados.'
  }
  return null
}

/** Apaga cadastro + espelho + carteirinhas e grava o snapshot no `AuditLog`. */
export async function executarPurgeMembro(
  membro: MembroParaPurge,
  atorId: string,
): Promise<void> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const espelho: { id: string; tenantId: string; userId: string } | null =
      await tx.saasMembro.findUnique({
        where: { membroOrigemId: membro.id },
        select: { id: true, tenantId: true, userId: true },
      })

    // Carteirinha primeiro: `numeroSocio` é unique por tenant e precisa voltar
    // ao pool junto com o cadastro.
    const alvos = [
      { tenantId: membro.tenantId, userId: membro.userId },
      ...(espelho ? [{ tenantId: espelho.tenantId, userId: espelho.userId }] : []),
    ]
    for (const alvo of alvos) {
      await tx.saasSocio.deleteMany({
        where: { tenantId: alvo.tenantId, userId: alvo.userId },
      })
    }

    if (espelho) await tx.saasMembro.delete({ where: { id: espelho.id } })
    await tx.saasMembro.delete({ where: { id: membro.id } })

    await tx.auditLog.create({
      data: {
        tenantId: membro.tenantId,
        atorId,
        acao: 'MEMBRO_APAGADO',
        entidade: 'SaasMembro',
        entidadeId: membro.id,
        // Depois do delete não há de onde reconstruir quem era.
        detalhes: {
          userId: membro.userId,
          nome: membro.nome,
          tipo: membro.tipo,
          status: membro.status,
          numeroAssociado: membro.numeroAssociado,
          desligadoEm: membro.desligadoEm?.toISOString() ?? null,
          espelhoId: espelho?.id ?? null,
        },
      },
    })
  })
}
