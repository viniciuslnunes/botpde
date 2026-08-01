import { cache } from 'react'
import { unstable_cache, revalidateTag } from 'next/cache'
import { db } from '@torcida/db'

/**
 * R5 — canal restrito: fonte única do estado de isolamento de um tenant.
 *
 * A liderança de uma subsede/PDE pode fechar o canal da unidade. Isso a remove
 * da malha de INTERAÇÃO (comunidade nacional, aliados, salas, lojas, DMs,
 * onboarding público, busca) sem tocar em nenhum dado: nada é apagado, o corte
 * é aplicado em tempo de LEITURA. Desligar o toggle reestabelece tudo sozinho.
 *
 * Ninguém deve ler `Tenant.canalRestrito` direto — o estado EFETIVO desconta a
 * expiração automática da solicitação de reativação (ver abaixo).
 */

export const ISOLAMENTO_CACHE_TAG = 'canal-restrito'

/** Prazo de silêncio da liderança antes da reativação automática. */
export const PRAZO_REATIVACAO_DIAS = 5

export function prazoReativacaoAPartirDe(inicio: Date): Date {
  return new Date(inicio.getTime() + PRAZO_REATIVACAO_DIAS * 24 * 60 * 60 * 1000)
}

/** Invalida o estado de isolamento em toda a plataforma (toggle e decisões). */
export function invalidateIsolamentoCache(): void {
  revalidateTag(ISOLAMENTO_CACHE_TAG, 'max')
}

interface TenantRestritoCache {
  id: string
  /** Prazo da solicitação de reativação PENDENTE mais próxima (ISO), se houver. */
  prazoIso: string | null
}

interface TenantRestritoRow {
  id: string
  solicitacoesReativacao: { prazoEm: Date }[]
}

async function carregarTenantsRestritos(): Promise<TenantRestritoCache[]> {
  const rows: TenantRestritoRow[] = await db.tenant.findMany({
    where: { canalRestrito: true },
    select: {
      id: true,
      solicitacoesReativacao: {
        where: { status: 'PENDENTE' },
        select: { prazoEm: true },
        orderBy: { prazoEm: 'asc' },
        take: 1,
      },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    prazoIso: r.solicitacoesReativacao[0]?.prazoEm.toISOString() ?? null,
  }))
}

/**
 * Tenants com canal restrito EFETIVO.
 *
 * A expiração dos 5 dias é DERIVADA aqui, não no cron: se a liderança não
 * respondeu até `prazoEm`, o tenant já sai deste conjunto na leitura seguinte —
 * a reativação automática não depende do scheduler estar de pé. O cron
 * (`/api/cron/canal-restrito-expiracao`) só materializa a linha, audita e
 * notifica.
 *
 * O `unstable_cache` guarda as linhas cruas (com o prazo em ISO) e o corte por
 * tempo acontece FORA dele — assim a janela de 60s do cache não atrasa a
 * reativação nem um segundo.
 */
export const getTenantsRestritos = cache(async (): Promise<Set<string>> => {
  const rows: TenantRestritoCache[] = await unstable_cache(
    carregarTenantsRestritos,
    ['tenants-canal-restrito'],
    { revalidate: 60, tags: [ISOLAMENTO_CACHE_TAG] },
  )()

  const agora = Date.now()
  const restritos = new Set<string>()
  for (const row of rows) {
    if (row.prazoIso !== null && Date.parse(row.prazoIso) <= agora) continue
    restritos.add(row.id)
  }
  return restritos
})

export async function isTenantRestrito(tenantId: string): Promise<boolean> {
  const restritos = await getTenantsRestritos()
  return restritos.has(tenantId)
}

/**
 * Remove tenants com canal restrito de uma lista de ids.
 * `manter` preserva o próprio tenant do viewer — uma unidade restrita continua
 * enxergando a si mesma (comunidade e administração internas seguem intactas).
 */
export async function filtrarTenantsRestritos(
  ids: string[],
  manter?: string,
): Promise<string[]> {
  const restritos = await getTenantsRestritos()
  if (restritos.size === 0) return ids
  return ids.filter((id) => id === manter || !restritos.has(id))
}

/** Estado de isolamento dos dois lados de uma relação, em uma leitura só. */
export async function estadoIsolamentoDoPar(
  atorTenantId: string,
  alvoTenantId: string,
): Promise<{ atorRestrito: boolean; alvoRestrito: boolean }> {
  const restritos = await getTenantsRestritos()
  return {
    atorRestrito: restritos.has(atorTenantId),
    alvoRestrito: restritos.has(alvoTenantId),
  }
}
