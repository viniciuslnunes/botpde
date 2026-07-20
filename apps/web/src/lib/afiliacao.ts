import 'server-only'

import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { formatNomeTorcida } from '@torcida/types'
import { ExpectedError } from './expected-error'
import { invalidateHierarchyCache, wouldCreateSedeCycle } from './hierarquia'

/**
 * Materialização da afiliação aprovada (PENDENTE → ATIVA) — Fase 2 da
 * governança hierárquica (proposta §9):
 *
 * 1. Encaixa o nó `Sede` da unidade sob a raiz SEDE da Sede-mãe
 *    (`Sede.sedeId`), somente se não criar ciclo (`wouldCreateSedeCycle`).
 * 2. Auto-provisiona o canal oficial da unidade (Conversa CANAL, oficial,
 *    institucional, HIERARQUIA, somenteAdminPublica) se ainda não houver,
 *    gravando o id em `Sede.canalConversaId`.
 * 3. Backfill: membros APROVADOS do tenant da unidade → `MembroConversa`
 *    (upsert idempotente pela unique [conversaId, userId]).
 *
 * Novos membros entram no canal via gancho em `aprovarMembro` — NUNCA em GET.
 */

export interface MaterializacaoAfiliacao {
  unidadeTenantId: string
  sedeRaizId: string | null
  canalConversaId: string
  membrosVinculados: number
}

interface UnidadeSedeLite {
  id: string
  tenantId: string | null
  nome: string
  canalConversaId: string | null
}

export async function materializarAfiliacaoAprovada(
  params: {
    unidadeSedeId: string
    sedePaiTenantId: string | null
    atorId: string
  },
  /** Transação do chamador (flip de status + materialização atômicos). */
  tx?: Prisma.TransactionClient,
): Promise<MaterializacaoAfiliacao> {
  const { unidadeSedeId, sedePaiTenantId, atorId } = params

  const unidade: UnidadeSedeLite | null = await db.sede.findUnique({
    where: { id: unidadeSedeId },
    select: { id: true, tenantId: true, nome: true, canalConversaId: true },
  })
  if (!unidade) throw new ExpectedError('Unidade não encontrada.')
  if (!unidade.tenantId) {
    throw new ExpectedError(
      'A unidade candidata precisa ter portal próprio (tenant) antes da afiliação.',
    )
  }
  const unidadeTenantId = unidade.tenantId

  // Raiz SEDE da Sede-mãe — a aresta pai-filho da árvore aponta para ela.
  let sedeRaizId: string | null = null
  if (sedePaiTenantId) {
    const raiz: { id: string } | null = await db.sede.findFirst({
      where: { tenantId: sedePaiTenantId, tipo: 'SEDE' },
      select: { id: true },
    })
    if (!raiz) {
      throw new ExpectedError('A Sede-mãe não tem nó Sede raiz (tipo SEDE) cadastrado.')
    }
    if (await wouldCreateSedeCycle(unidadeSedeId, raiz.id)) {
      throw new ExpectedError(
        'Este vínculo criaria um ciclo na árvore de sedes — afiliação abortada.',
      )
    }
    sedeRaizId = raiz.id
  }

  const executar = async (tx: Prisma.TransactionClient): Promise<MaterializacaoAfiliacao> => {
    if (sedeRaizId) {
      await tx.sede.update({
        where: { id: unidadeSedeId },
        data: { sedeId: sedeRaizId },
      })
    }

    // Canal oficial da unidade — espelha o padrão do canal de departamento.
    let canalConversaId = unidade.canalConversaId
    if (!canalConversaId) {
      const canal: { id: string } = await tx.conversa.create({
        data: {
          tipo: 'CANAL',
          tenantId: unidadeTenantId,
          nome: formatNomeTorcida(unidade.nome),
          descricao: 'Canal oficial da unidade',
          institucional: true,
          canalOficial: true,
          visibilidadeCanal: 'HIERARQUIA',
          somenteAdminPublica: true,
          publica: true,
          criadoPorId: atorId,
          membros: {
            create: { userId: atorId, papel: 'ADMIN' },
          },
        },
        select: { id: true },
      })
      canalConversaId = canal.id
      await tx.sede.update({
        where: { id: unidadeSedeId },
        data: { canalConversaId },
      })
    }

    // Backfill dos membros APROVADOS da unidade no canal (idempotente).
    const membros: { userId: string }[] = await tx.saasMembro.findMany({
      where: { tenantId: unidadeTenantId, status: 'APROVADO' },
      select: { userId: true },
    })
    for (const membro of membros) {
      await tx.membroConversa.upsert({
        where: { conversaId_userId: { conversaId: canalConversaId, userId: membro.userId } },
        create: { conversaId: canalConversaId, userId: membro.userId, papel: 'MEMBRO' },
        update: { saiuEm: null },
      })
    }

    return {
      unidadeTenantId,
      sedeRaizId,
      canalConversaId,
      membrosVinculados: membros.length,
    }
  }

  const resultado = tx ? await executar(tx) : await db.$transaction(executar)

  invalidateHierarchyCache(unidadeTenantId)
  if (sedePaiTenantId) invalidateHierarchyCache(sedePaiTenantId)

  return resultado
}

/**
 * Desfaz a materialização ao encerrar o vínculo (ATIVA → ENCERRADA):
 * remove a aresta da árvore (`Sede.sedeId = null`) e desliga o auto-vínculo
 * do canal setando `saiuEm` nos membros (sem hard delete — proposta §9).
 * O ADMIN do canal permanece: o canal continua sendo da própria unidade.
 */
export async function desfazerMaterializacaoAfiliacao(params: {
  unidadeSedeId: string
  sedePaiTenantId: string | null
}): Promise<void> {
  const { unidadeSedeId, sedePaiTenantId } = params

  const unidade: UnidadeSedeLite | null = await db.sede.findUnique({
    where: { id: unidadeSedeId },
    select: { id: true, tenantId: true, nome: true, canalConversaId: true },
  })
  if (!unidade) throw new ExpectedError('Unidade não encontrada.')

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.sede.update({
      where: { id: unidadeSedeId },
      data: { sedeId: null },
    })

    if (unidade.canalConversaId) {
      await tx.membroConversa.updateMany({
        where: {
          conversaId: unidade.canalConversaId,
          papel: 'MEMBRO',
          saiuEm: null,
        },
        data: { saiuEm: new Date() },
      })
    }
  })

  if (unidade.tenantId) invalidateHierarchyCache(unidade.tenantId)
  if (sedePaiTenantId) invalidateHierarchyCache(sedePaiTenantId)
}
