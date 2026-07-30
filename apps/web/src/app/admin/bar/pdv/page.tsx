import { redirect } from 'next/navigation'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import {
  getTurnoAbertoBar,
  listarCategoriasBar,
  listarMembrosParaFiado,
  listarProdutosBar,
  listarVendasBar,
  resolveUnidadeBar,
  resumirTurnoBar,
} from '@/lib/bar'
import type { BarCategoriaLite, BarMembroParaFiadoLite, BarProdutoLite, BarVendaLite } from '@/lib/bar'
import { serializeProdutoBar, serializeVendaBar } from '@/lib/bar-serialize'
import { BarPdv } from '@/components/admin/bar/bar-pdv'
import { BarTurnoPainel } from '@/components/admin/bar/bar-turno-painel'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'PDV — Bar Admin' }

export default async function AdminBarPdvPage() {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE]))
  } catch {
    redirect('/admin')
  }

  let podeGerir = false
  try {
    await assertPermission(PERMISSIONS.BAR_MANAGE)
    podeGerir = true
  } catch {
    // Operador do PDV sem gestão — não cancela/estorna/fecha turno.
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
  const turno = await getTurnoAbertoBar(tenant.id, unidade.id)

  const [produtos, categorias, pendentesLista, resumoTurno, membrosFiado]: [
    BarProdutoLite[],
    BarCategoriaLite[],
    Awaited<ReturnType<typeof listarVendasBar>>,
    Awaited<ReturnType<typeof resumirTurnoBar>> | null,
    BarMembroParaFiadoLite[],
  ] = await Promise.all([
    listarProdutosBar(tenant.id, unidade.id, { apenasAtivos: true }),
    listarCategoriasBar(tenant.id, unidade.id),
    listarVendasBar(tenant.id, unidade.id, { status: 'PENDENTE', pageSize: 8 }),
    turno ? resumirTurnoBar(tenant.id, turno.id) : Promise.resolve(null),
    podeGerir ? listarMembrosParaFiado(tenant.id, unidade.id) : Promise.resolve([]),
  ])

  const categoriasAtivas = categorias
    .filter((c) => c.ativo)
    .map((c) => ({ id: c.id, nome: c.nome }))

  const pendentes: ReturnType<typeof serializeVendaBar>[] = (
    pendentesLista.itens as BarVendaLite[]
  ).map(serializeVendaBar)

  return (
    <BarPdv
      produtos={produtos.map(serializeProdutoBar)}
      categorias={categoriasAtivas}
      pendentes={pendentes}
      pendentesTotal={pendentesLista.total}
      unidadeNome={unidade.nome}
      podeCancelar={podeGerir}
      podeGerir={podeGerir}
      membrosFiado={membrosFiado.map((m) => ({ id: m.membroId, nome: m.nome }))}
      turnoAberto={Boolean(turno)}
      turnoResumo={resumoTurno}
      turnoPainel={
        <BarTurnoPainel
          compact
          turno={
            turno
              ? {
                  id: turno.id,
                  abertoEm: turno.abertoEm.toISOString(),
                  abertoPorNome: turno.abertoPor.nome,
                }
              : null
          }
          resumo={resumoTurno}
          podeGerir={podeGerir}
        />
      }
    />
  )
}
