import { redirect } from 'next/navigation'
import { PERMISSIONS, STATUS_FIADO_BAR_LABEL } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarFiadosBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarFiadoLite } from '@/lib/bar'
import { BarFiadoList, type BarFiadoItem } from '@/components/admin/bar/bar-fiado-list'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Fiado — Bar Admin' }

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(data)
}

export default async function AdminBarFiadoPage() {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE))
  } catch {
    redirect('/admin/bar')
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
  const fiados: BarFiadoLite[] = await listarFiadosBar(tenant.id, unidade.id)

  const pendentes = fiados.filter((f) => f.status === 'PENDENTE' || f.status === 'VENCIDA').length

  const itens: BarFiadoItem[] = fiados.map((f) => ({
    id: f.id,
    devedorNome: f.devedorNome ?? 'Sem nome',
    valorLabel: formatarPreco(Number(f.valor)),
    vencimentoLabel: formatarData(f.vencimento),
    status: f.status,
    statusLabel: STATUS_FIADO_BAR_LABEL[f.status] ?? f.status,
    criadoEmLabel: formatarData(f.criadoEm),
  }))

  return (
    <>
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        {pendentes > 0
          ? `${pendentes} fiado${pendentes !== 1 ? 's' : ''} pendente${pendentes !== 1 ? 's' : ''} nesta unidade.`
          : 'Nenhum fiado pendente nesta unidade.'}
      </p>

      <BarFiadoList fiados={itens} />
    </>
  )
}
