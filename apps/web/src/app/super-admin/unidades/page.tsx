import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Handshake } from 'lucide-react'
import { db } from '@torcida/db'
import { formatNomeAfiliacao, formatNomeTorcida } from '@torcida/types'
import { auth } from '@/lib/auth'
import {
  herdarDadosSedeNaSolicitacao,
  resolverStatusExibicaoSolicitacao,
} from '@/lib/afiliacao-unidade'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  carregarMapaPortalMae,
  filtrarTenantsRaiz,
} from '@/lib/tenant-hierarquia-plataforma'
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
  regiao: string | null
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
  solicitadoPor: {
    nome: string | null
    email: string | null
    avatarUrl: string | null
  } | null
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

  const [solicitacoesRows, torcidasRows, maePorFilho]: [
    SolicitacaoRow[],
    TorcidaRow[],
    Map<string, string>,
  ] = await Promise.all([
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
        regiao: true,
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
        solicitadoPor: { select: { nome: true, email: true, avatarUrl: true } },
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
    carregarMapaPortalMae(),
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
      // Status mais recente: APROVADA cuja Sede foi excluída vira REMOVIDA.
      status: resolverStatusExibicaoSolicitacao(s.status, Boolean(s.sede)),
      torcidaNome: formatNomeTorcida(s.tenant.nome),
      nome: locais.nome,
      tipo: locais.tipo,
      cidade: locais.cidade,
      estado: locais.estado,
      endereco: locais.endereco,
      regiao: s.regiao,
      cep: locais.cep,
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
      solicitadoPor: s.solicitadoPor
        ? {
            nome: s.solicitadoPor.nome,
            email: s.solicitadoPor.email,
            image: s.solicitadoPor.avatarUrl,
          }
        : null,
      sedeId: s.sede?.id ?? null,
      // Já promovida = a Sede criada tem tenant próprio (≠ tenant da torcida).
      promovida: Boolean(s.sede && s.sede.tenantId && s.sede.tenantId !== s.tenantId),
    }
  })

  const raizSet = new Set(
    filtrarTenantsRaiz(
      torcidasRows.map((t) => t.id),
      maePorFilho,
    ),
  )
  const torcidas: TorcidaOption[] = torcidasRows
    .filter((t) => raizSet.has(t.id))
    .map((t) => ({
      id: t.id,
      nome: formatNomeTorcida(t.nome),
      clubeNome: t.afiliacao?.nome ? formatNomeAfiliacao(t.afiliacao.nome) : null,
    }))

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Afiliações de unidades"
        description="Solicitações de cadastro de subsedes e PDEs — vindas do onboarding ou registradas aqui. Ao aprovar, a unidade é criada e promovida a portal próprio. O seletor lista só torcidas-raiz (não portais de unidade)."
        icon={<Handshake className="h-5 w-5" />}
      />
      <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
        <AfiliacoesConsole solicitacoes={solicitacoes} torcidas={torcidas} />
      </div>
    </div>
  )
}
