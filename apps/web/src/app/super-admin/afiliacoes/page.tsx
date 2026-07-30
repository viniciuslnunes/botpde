import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Handshake } from 'lucide-react'
import { db } from '@torcida/db'
import { formatNomeAfiliacao, formatNomeTorcida } from '@torcida/types'
import { auth } from '@/lib/auth'
import { herdarDadosSedeNaSolicitacao } from '@/lib/afiliacao-unidade'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import {
  AfiliacoesConsole,
  type SolicitacaoView,
  type TorcidaOption,
} from './afiliacoes-console'

export const metadata: Metadata = { title: 'Afiliações — Super Admin' }

interface SolicitacaoRow {
  id: string
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA'
  nome: string
  tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
  cep: string | null
  contatoNome: string | null
  fotoUrl: string | null
  lat: number | null
  lng: number | null
  contatoEmail: string | null
  contatoTelefone: string | null
  vinculo: string | null
  observacao: string | null
  provasUrls: string[]
  motivo: string | null
  criadoEm: Date
  tenantId: string
  tenant: { nome: string }
  sede: {
    id: string
    tenantId: string | null
    nome: string
    tipo: string
    cidade: string | null
    estado: string | null
    endereco: string | null
    cep: string | null
    lat: number | null
    lng: number | null
    fotoUrl: string | null
  } | null
}

interface TorcidaRow {
  id: string
  nome: string
  afiliacao: { nome: string } | null
}

export default async function AfiliacoesSuperAdminPage() {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const [solicitacoesRows, torcidasRows]: [SolicitacaoRow[], TorcidaRow[]] = await Promise.all([
    db.solicitacaoUnidade.findMany({
      where: { tipo: { not: 'SEDE' } },
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      take: 200,
      select: {
        id: true,
        status: true,
        nome: true,
        tipo: true,
        cidade: true,
        estado: true,
        endereco: true,
        contatoNome: true,
        cep: true,
        lat: true,
        lng: true,
        fotoUrl: true,
        contatoEmail: true,
        contatoTelefone: true,
        vinculo: true,
        observacao: true,
        provasUrls: true,
        motivo: true,
        criadoEm: true,
        tenantId: true,
        tenant: { select: { nome: true } },
        sede: {
          select: {
            id: true,
            tenantId: true,
            nome: true,
            tipo: true,
            cidade: true,
            estado: true,
            endereco: true,
            cep: true,
            lat: true,
            lng: true,
            fotoUrl: true,
          },
        },
      },
    }),
    db.tenant.findMany({
      where: { ativo: true, sintetico: false },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, afiliacao: { select: { nome: true } } },
    }),
  ])

  const solicitacoes: SolicitacaoView[] = solicitacoesRows.map((s) => {
    const tipoSnap =
      s.tipo === 'SUBSEDE' || s.tipo === 'PONTO_ENCONTRO' ? s.tipo : ('PONTO_ENCONTRO' as const)
    const locais = herdarDadosSedeNaSolicitacao(
      {
        nome: s.nome,
        tipo: tipoSnap,
        cidade: s.cidade,
        estado: s.estado,
        endereco: s.endereco,
        cep: s.cep,
        lat: s.lat,
        lng: s.lng,
        fotoUrl: s.fotoUrl,
      },
      s.status,
      s.sede,
    )
    return {
      id: s.id,
      status: s.status,
      torcidaNome: formatNomeTorcida(s.tenant.nome),
      nome: locais.nome,
      tipo: locais.tipo,
      cidade: locais.cidade,
      estado: locais.estado,
      endereco: locais.endereco,
      contatoNome: s.contatoNome,
      fotoUrl: locais.fotoUrl,
      lat: locais.lat,
      lng: locais.lng,
      contatoEmail: s.contatoEmail,
      contatoTelefone: s.contatoTelefone,
      vinculo: s.vinculo,
      observacao: s.observacao,
      provasUrls: s.provasUrls,
      motivo: s.motivo,
      criadoEm: s.criadoEm.toISOString(),
      sedeId: s.sede?.id ?? null,
      // Já promovida = a Sede criada tem tenant próprio (≠ tenant da torcida).
      promovida: Boolean(s.sede && s.sede.tenantId && s.sede.tenantId !== s.tenantId),
    }
  })

  const torcidas: TorcidaOption[] = torcidasRows.map((t) => ({
    id: t.id,
    nome: formatNomeTorcida(t.nome),
    clubeNome: t.afiliacao?.nome ? formatNomeAfiliacao(t.afiliacao.nome) : null,
  }))

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Afiliações de unidades"
        description="Solicitações de cadastro de subsedes e PDEs — vindas do onboarding ou registradas aqui. Ao aprovar, a unidade é criada e promovida a portal próprio. Presidente/Vice também decidem no console da torcida."
        icon={<Handshake className="h-5 w-5" />}
      />
      <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
        <AfiliacoesConsole solicitacoes={solicitacoes} torcidas={torcidas} />
      </div>
    </div>
  )
}
