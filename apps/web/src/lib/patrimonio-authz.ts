import {
  PERMISSIONS,
  podeGerirCategoriaPatrimonio,
  resolverEscopoPatrimonio,
} from '@torcida/types'
import type { CategoriaPatrimonioItem } from '@torcida/db'
import { db } from '@torcida/db'
import { ExpectedError } from '@/lib/expected-error'
import { assertAnyPermission } from '@/lib/authz'
import type { EscopoCategoria } from '@/lib/patrimonio'

/**
 * Gate do inventário depois que o Patrimônio virou inventário geral e as
 * bandeiras ganharam departamento próprio.
 *
 * `patrimony:*` vale para tudo; `flags:*` vale **só** para categoria
 * `BANDEIRA`. Ninguém entra no módulo por `flags:view` e sai lendo o acervo de
 * mesas e projetores: o recorte é aplicado na query
 * (`escopoCategoria`), não escondido na UI.
 */

const PERMISSOES_LEITURA_ACERVO = [
  PERMISSIONS.PATRIMONY_VIEW,
  PERMISSIONS.PATRIMONY_MANAGE,
  PERMISSIONS.FLAGS_VIEW,
  PERMISSIONS.FLAGS_MANAGE,
]

const PERMISSOES_ESCRITA_ACERVO = [PERMISSIONS.PATRIMONY_MANAGE, PERMISSIONS.FLAGS_MANAGE]

export type AcervoAuthz = Awaited<ReturnType<typeof assertAnyPermission>> & {
  escopo: ReturnType<typeof resolverEscopoPatrimonio>
  /** Categoria imposta às queries — `null` = inventário inteiro. */
  escopoCategoria: EscopoCategoria
}

function comEscopo(authz: Awaited<ReturnType<typeof assertAnyPermission>>): AcervoAuthz {
  const escopo = resolverEscopoPatrimonio(authz.permissoesEfetivas ?? [], {
    isSuperAdmin: Boolean(authz.isSuperAdmin),
  })
  return {
    ...authz,
    escopo,
    escopoCategoria: (escopo.categoriaTravada as EscopoCategoria) ?? null,
  }
}

/** Leitura do inventário: patrimônio inteiro ou só o acervo de bandeiras. */
export async function assertAcervoView(): Promise<AcervoAuthz> {
  return comEscopo(await assertAnyPermission(PERMISSOES_LEITURA_ACERVO))
}

const ERRO_FORA_DO_ACERVO =
  'Seu acesso cobre apenas o acervo de bandeiras. Itens de outras categorias são geridos pelo Patrimônio.'

/**
 * Escrita no inventário — ainda **sem** saber a categoria. Vem antes do parse
 * para que quem não tem acesso nenhum receba "sem permissão", não erro de Zod.
 */
export async function assertAcervoEscrita(): Promise<AcervoAuthz> {
  return comEscopo(await assertAnyPermission(PERMISSOES_ESCRITA_ACERVO))
}

/**
 * Segunda metade do gate: com a categoria em mãos, confere se este ator pode
 * escrever nela. Recusa com mensagem de negócio — quem tem só `flags:manage`
 * tentando editar um projetor não é bug.
 */
export function garantirCategoriaPermitida(
  authz: Pick<AcervoAuthz, 'permissoesEfetivas' | 'isSuperAdmin'>,
  categoria: CategoriaPatrimonioItem,
): void {
  const permitido = podeGerirCategoriaPatrimonio(authz.permissoesEfetivas ?? [], categoria, {
    isSuperAdmin: Boolean(authz.isSuperAdmin),
  })
  if (!permitido) throw new ExpectedError(ERRO_FORA_DO_ACERVO)
}

/**
 * Escrita num item existente: lê a categoria no tenant do ator antes de
 * decidir. Devolve o item para a action não repetir o SELECT.
 */
export async function assertPodeGerirItem(itemId: string): Promise<
  AcervoAuthz & { item: { id: string; categoria: CategoriaPatrimonioItem; meta: unknown } }
> {
  const authz = await assertAcervoEscrita()

  const item: { id: string; categoria: CategoriaPatrimonioItem; meta: unknown } | null =
    await db.patrimonioItem.findFirst({
      where: { id: itemId, tenantId: authz.tenant.id },
      select: { id: true, categoria: true, meta: true },
    })
  if (!item) throw new ExpectedError('Item não encontrado nesta torcida.')

  garantirCategoriaPermitida(authz, item.categoria)
  return { ...authz, item }
}
