'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS, ImportacaoLoteSchema } from '@torcida/types'
import { dedupKey, mockSource, type MembroImportInput } from '@/lib/importacao'
import { privatizarPerfilAoAprovarSocio } from '@/lib/social'
import { vincularMembroCanaisAposAprovacao } from '@/lib/canais'
import { z } from 'zod'

/**
 * Pipeline de importação de membros — ver docs/data/spec-importacao-membros.md.
 * Idempotente: rodar duas vezes com o mesmo lote não duplica membros (dedup por
 * User existente + unique (tenantId, userId) em SaasMembro).
 *
 * Origens: MOCK ativa agora (valida a apresentação com dados fake reversíveis);
 * BOT/CSV ficam com a estrutura pronta e são ativadas quando houver base real.
 */

export type ResultadoImportacao = {
  success: boolean
  error?: string
  importacaoId?: string
  importados?: number
  duplicados?: number
  erros?: number
}

const ImportarMockSchema = z.object({
  quantidade: z.coerce.number().int().min(1).max(500),
})

/** Erro de linha registrado em ImportacaoMembros.erros (Json). */
type ErroLinha = { linha: number; motivo: string }

type VinculoAprovado = { linha: number; userId: string; sedeId: string | null }

const CONCORRENCIA_VINCULOS_CANAIS = 8

async function executarComConcorrenciaLimitada<T>(
  itens: T[],
  limite: number,
  executar: (item: T) => Promise<void>,
): Promise<void> {
  let proximo = 0
  const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (proximo < itens.length) {
      const indice = proximo++
      await executar(itens[indice])
    }
  })
  await Promise.all(workers)
}

async function processarLote(
  tenantId: string,
  importacaoId: string,
  inputs: MembroImportInput[],
): Promise<{ importados: number; duplicados: number; erros: ErroLinha[] }> {
  let importados = 0
  let duplicados = 0
  const erros: ErroLinha[] = []
  const vinculosAprovados = new Map<string, VinculoAprovado>()
  // Dedup intra-lote: duas linhas com a mesma identidade no mesmo arquivo
  const vistos = new Set<string>()

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    try {
      const chave = dedupKey(input)
      if (chave && vistos.has(chave)) {
        duplicados++
        continue
      }
      if (chave) vistos.add(chave)

      // Resolve identidade: User existente por discordId > email
      let userId: string | null = null
      if (input.discordId) {
        const existente: { id: string } | null = await db.user.findUnique({
          where: { discordId: input.discordId },
          select: { id: true },
        })
        userId = existente?.id ?? null
      }
      if (!userId && input.email) {
        const existente: { id: string } | null = await db.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        })
        userId = existente?.id ?? null
      }

      // Já é membro deste tenant → duplicado (não sobrescreve, só conta)
      if (userId) {
        const membroExistente: { id: string; status: string; sedeId: string | null } | null =
          await db.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId, userId } },
          select: { id: true, status: true, sedeId: true },
        })
        if (membroExistente) {
          if (membroExistente.status === 'APROVADO') {
            vinculosAprovados.set(userId, {
              linha: i + 1,
              userId,
              sedeId: membroExistente.sedeId,
            })
          }
          duplicados++
          continue
        }
      }

      // Cria o User mínimo quando não existe (só identidade + nome; sem
      // email/senha — conta real é vinculada depois pelo login OAuth)
      if (!userId) {
        const criado: { id: string } = await db.user.create({
          data: {
            nome: input.nome,
            discordId: input.discordId ?? null,
            email: input.email ?? null,
          },
          select: { id: true },
        })
        userId = criado.id
      }

      // Membro importado entra APROVADO (base já vetada pela torcida)
      await db.saasMembro.create({
        data: {
          tenantId,
          userId,
          tipo: input.tipo,
          nome: input.nome,
          idade: input.idade ?? null,
          telefone: input.telefone ?? null,
          cidade: input.cidade ?? null,
          numeroAssociado: input.numeroAssociado ?? null,
          discordId: input.discordId ?? null,
          status: 'APROVADO',
          aprovadoEm: new Date(),
          aprovadoPorNome: 'Importação',
          importacaoId,
        },
      })
      if (input.tipo === 'SOCIO') {
        await privatizarPerfilAoAprovarSocio(userId, tenantId)
      }
      vinculosAprovados.set(userId, { linha: i + 1, userId, sedeId: null })
      importados++
    } catch (e) {
      erros.push({ linha: i + 1, motivo: e instanceof Error ? e.message : 'Erro desconhecido' })
    }
  }

  // O lote pode chegar a 500 linhas. Provisionar depois das escritas mantém o
  // fluxo idempotente e limita pressão no pool; reimportar também cura membros
  // APROVADOS que já existiam, sem duplicar MembroConversa (helper usa upsert).
  await executarComConcorrenciaLimitada(
    [...vinculosAprovados.values()],
    CONCORRENCIA_VINCULOS_CANAIS,
    async (vinculo) => {
      try {
        await vincularMembroCanaisAposAprovacao({
          tenantId,
          userId: vinculo.userId,
          sedeId: vinculo.sedeId,
          fallbackCriadoPorId: vinculo.userId,
        })
      } catch (error) {
        erros.push({
          linha: vinculo.linha,
          motivo: `Vínculo nos canais oficiais: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
        })
      }
    },
  )

  return { importados, duplicados, erros }
}

/** Importa N membros mock (origem MOCK) — demonstração reversível. */
export async function importarMock(formData: FormData): Promise<ResultadoImportacao> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_IMPORT)

  const parsed = ImportarMockSchema.safeParse({ quantidade: formData.get('quantidade') })
  if (!parsed.success) {
    return { success: false, error: 'Quantidade inválida (1 a 500).' }
  }

  const lote = ImportacaoLoteSchema.safeParse(mockSource(parsed.data.quantidade))
  if (!lote.success) {
    return { success: false, error: 'Lote gerado inválido.' }
  }

  const importacao: { id: string } = await db.importacaoMembros.create({
    data: {
      tenantId: tenant.id,
      origem: 'MOCK',
      status: 'PROCESSANDO',
      totalLinhas: lote.data.length,
      criadoPorId: session.user.id,
    },
    select: { id: true },
  })

  const { importados, duplicados, erros } = await processarLote(tenant.id, importacao.id, lote.data)

  await db.importacaoMembros.update({
    where: { id: importacao.id },
    data: {
      status: erros.length === lote.data.length ? 'ERRO' : 'CONCLUIDA',
      importados,
      duplicados,
      erros: erros.length > 0 ? erros : undefined,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBROS_IMPORTADOS',
      entidade: 'ImportacaoMembros',
      entidadeId: importacao.id,
      detalhes: { origem: 'MOCK', totalLinhas: lote.data.length, importados, duplicados, erros: erros.length },
    },
  })

  revalidatePath('/admin/membros/importar')
  revalidatePath('/admin/membros')
  revalidatePath('/admin')

  return { success: true, importacaoId: importacao.id, importados, duplicados, erros: erros.length }
}

/**
 * Desfaz uma importação MOCK: remove os SaasMembro criados por ela e os Users
 * mock órfãos (criados pela importação e sem nenhum outro vínculo). Restrito a
 * MOCK no MVP — importações reais não são reversíveis por aqui.
 */
export async function desfazerImportacao(importacaoId: string): Promise<ResultadoImportacao> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_IMPORT)

  const importacao: { id: string; origem: string; tenantId: string } | null =
    await db.importacaoMembros.findUnique({
      where: { id: importacaoId },
      select: { id: true, origem: true, tenantId: true },
    })

  if (!importacao || importacao.tenantId !== tenant.id) {
    return { success: false, error: 'Importação não encontrada.' }
  }
  if (importacao.origem !== 'MOCK') {
    return { success: false, error: 'Só importações MOCK podem ser desfeitas.' }
  }

  // Users candidatos a limpeza: os vinculados aos membros desta importação
  const membros: { userId: string }[] = await db.saasMembro.findMany({
    where: { tenantId: tenant.id, importacaoId },
    select: { userId: true },
  })
  const userIds = membros.map((m) => m.userId)

  const { count: removidos } = await db.saasMembro.deleteMany({
    where: { tenantId: tenant.id, importacaoId },
  })

  // Remove Users mock órfãos: criados como mock (discordId 'mock-…') e sem
  // nenhum vínculo restante em nenhum tenant
  const { count: usersRemovidos } = await db.user.deleteMany({
    where: {
      id: { in: userIds },
      discordId: { startsWith: 'mock-' },
      membros: { none: {} },
      userRoles: { none: {} },
      socios: { none: {} },
      pedidos: { none: {} },
    },
  })

  await db.importacaoMembros.delete({ where: { id: importacaoId } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'IMPORTACAO_DESFEITA',
      entidade: 'ImportacaoMembros',
      entidadeId: importacaoId,
      detalhes: { membrosRemovidos: removidos, usersRemovidos },
    },
  })

  revalidatePath('/admin/membros/importar')
  revalidatePath('/admin/membros')
  revalidatePath('/admin')

  return { success: true, importados: removidos }
}
