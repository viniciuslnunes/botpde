import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
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
  contatoNome: string
  contatoEmail: string | null
  contatoTelefone: string | null
  vinculo: string | null
  observacao: string | null
  provasUrls: string[]
  motivo: string | null
  criadoEm: Date
  tenant: { nome: string }
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
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      select: {
        id: true,
        status: true,
        nome: true,
        tipo: true,
        cidade: true,
        estado: true,
        endereco: true,
        contatoNome: true,
        contatoEmail: true,
        contatoTelefone: true,
        vinculo: true,
        observacao: true,
        provasUrls: true,
        motivo: true,
        criadoEm: true,
        tenant: { select: { nome: true } },
      },
    }),
    db.tenant.findMany({
      where: { ativo: true, sintetico: false },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, afiliacao: { select: { nome: true } } },
    }),
  ])

  const solicitacoes: SolicitacaoView[] = solicitacoesRows
    .filter((s): s is SolicitacaoRow & { tipo: 'SUBSEDE' | 'PONTO_ENCONTRO' } => s.tipo !== 'SEDE')
    .map((s) => ({
      id: s.id,
      status: s.status,
      torcidaNome: s.tenant.nome,
      nome: s.nome,
      tipo: s.tipo,
      cidade: s.cidade,
      estado: s.estado,
      endereco: s.endereco,
      contatoNome: s.contatoNome,
      contatoEmail: s.contatoEmail,
      contatoTelefone: s.contatoTelefone,
      vinculo: s.vinculo,
      observacao: s.observacao,
      provasUrls: s.provasUrls,
      motivo: s.motivo,
      criadoEm: s.criadoEm.toISOString(),
    }))

  const torcidas: TorcidaOption[] = torcidasRows.map((t) => ({
    id: t.id,
    nome: t.nome,
    clubeNome: t.afiliacao?.nome ?? null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Afiliações de unidades</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Solicitações de cadastro de subsedes e PDEs — vindas do onboarding ou registradas aqui.
          Ao aprovar, a unidade é criada sob a torcida. Presidente/Vice também decidem no console da
          torcida.
        </p>
      </div>
      <AfiliacoesConsole solicitacoes={solicitacoes} torcidas={torcidas} />
    </div>
  )
}
