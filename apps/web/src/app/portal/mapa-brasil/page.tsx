import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import {
  getAfiliacoesParaOnboarding,
  getRegioesOnboarding,
} from '@/lib/onboarding'
import { listarVinculosCanonicosDoUsuario } from '@/lib/associe-se'
import { estadoCtaAssocieSe } from '@torcida/types/associe-se'
import { formatNomeAfiliacao } from '@torcida/types'
import { MapaBrasilExplorer } from '@/components/portal/mapa-brasil-explorer'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ver no Brasil' }

export default async function MapaBrasilPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const [afiliacoes, regioes, perfil, vinculos] = await Promise.all([
    getAfiliacoesParaOnboarding(),
    getRegioesOnboarding(),
    db.perfilTorcedor.findUnique({
      where: { userId: session.user.id },
      select: {
        afiliacaoId: true,
        afiliacao: { select: { nome: true, apelido: true } },
      },
    }),
    listarVinculosCanonicosDoUsuario(session.user.id),
  ])

  const cta = estadoCtaAssocieSe(vinculos)
  const podeAssociar = cta.modo === 'descobrir' || cta.modo === 'upgrade'
  const nomeClube = perfil?.afiliacao
    ? formatNomeAfiliacao(perfil.afiliacao.apelido || perfil.afiliacao.nome)
    : null

  return (
    <MapaBrasilExplorer
      afiliacoesIniciais={afiliacoes}
      regioes={regioes}
      clubeVinculadoId={perfil?.afiliacaoId ?? null}
      clubeVinculadoNome={nomeClube}
      podeAssociar={podeAssociar}
    />
  )
}
