import type { PrismaClient } from '@torcida/db'

type Db = Pick<PrismaClient, 'saasMembro'>

type MembroAreaUnidadeInput = {
  id: string
  espelhado: boolean
  membroOrigemId: string | null
  departamento: { nome: string } | null
  sede: { tipo: string } | null
}

/**
 * Espelho já analisado fica só leitura nas **unidades**; na administração da
 * Sede (tenant com `Sede.tipo = SEDE`) a diretoria central mantém gestão plena.
 */
export function espelhoSomenteLeituraNoAdmin(
  espelhado: boolean | undefined,
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO',
  isAdministracaoSede: boolean,
): boolean {
  return Boolean(espelhado && status !== 'PENDENTE' && !isAdministracaoSede)
}

/** Área de departamento na unidade territorial do vínculo (não na Sede). */
export function resolverDepartamentoUnidadeNome(
  membro: MembroAreaUnidadeInput,
  opts: {
    isAdministracaoSede: boolean
    departamentoOrigemNome?: string | null
  },
): string | null {
  if (membro.espelhado && membro.membroOrigemId) {
    return opts.departamentoOrigemNome?.trim() || null
  }
  if (membro.sede?.tipo && membro.sede.tipo !== 'SEDE') {
    return membro.departamento?.nome?.trim() || null
  }
  if (!opts.isAdministracaoSede) {
    return membro.departamento?.nome?.trim() || null
  }
  return null
}

/** Lote: origem dos espelhos → nome do departamento na unidade. */
export async function carregarDepartamentoUnidadePorMembro(
  db: Db,
  membros: MembroAreaUnidadeInput[],
  isAdministracaoSede: boolean,
): Promise<Map<string, string | null>> {
  const origemIds = [
    ...new Set(
      membros
        .filter((m) => m.espelhado && m.membroOrigemId)
        .map((m) => m.membroOrigemId as string),
    ),
  ]
  const origens =
    origemIds.length > 0
      ? await db.saasMembro.findMany({
          where: { id: { in: origemIds } },
          select: { id: true, departamento: { select: { nome: true } } },
        })
      : []
  const deptPorOrigemId = new Map(
    origens.map((o) => [o.id, o.departamento?.nome?.trim() ?? null]),
  )

  return new Map(
    membros.map((m) => [
      m.id,
      resolverDepartamentoUnidadeNome(m, {
        isAdministracaoSede,
        departamentoOrigemNome: m.membroOrigemId
          ? deptPorOrigemId.get(m.membroOrigemId)
          : null,
      }),
    ]),
  )
}
