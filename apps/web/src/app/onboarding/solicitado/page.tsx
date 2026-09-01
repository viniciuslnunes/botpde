import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { SolicitacaoResumoCard } from '@/components/onboarding/solicitacao-resumo-card'

export default async function SolicitacaoEnviadaPage({
  searchParams,
}: {
  searchParams: Promise<{ torcida?: string }>
}) {
  const [params, session] = await Promise.all([searchParams, auth()])
  if (!session?.user?.id) redirect('/entrar')

  const slug = params.torcida?.trim()
  const torcida = slug
    ? await db.tenant.findFirst({
        where: { slug, ativo: true },
        select: { id: true, nome: true, slug: true },
      })
    : null

  const solicitacao = await db.saasMembro.findFirst({
    where: {
      userId: session.user.id,
      tipo: 'SOCIO',
      espelhado: false,
      ...(torcida ? { tenantId: torcida.id } : {}),
    },
    orderBy: { atualizadoEm: 'desc' },
    select: {
      nome: true,
      tipo: true,
      telefone: true,
      cidade: true,
      dataNascimento: true,
      rg: true,
      cpf: true,
      logradouro: true,
      numero: true,
      bloco: true,
      complemento: true,
      bairro: true,
      cep: true,
      uf: true,
      responsavelNome: true,
      responsavelDocumento: true,
      imagemProva: true,
      fotoDocumentoUrl: true,
      comprovanteResidenciaUrl: true,
      status: true,
    },
  })

  return (
    <div className="flex flex-1 flex-col justify-center py-12 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
      <h1 className="mt-4 text-2xl font-bold text-[rgb(var(--foreground))]">
        Solicitação enviada
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--foreground-muted))]">
        {torcida ? (
          <>
            Sua solicitação foi registrada na <strong>{torcida.nome}</strong>. Enquanto a
            liderança analisa, você já pode usar a Comunidade Nacional do clube e o canal
            da unidade — a aprovação libera o mural da torcida e os benefícios de sócio.
          </>
        ) : (
          <>Sua solicitação foi registrada. A liderança da torcida vai analisar em breve.</>
        )}
      </p>

      {solicitacao?.status === 'PENDENTE' ? (
        <div className="mx-auto mt-8 w-full max-w-4xl text-left">
          <SolicitacaoResumoCard
            data={{
              nome: solicitacao.nome,
              tipo: solicitacao.tipo === 'SOCIO' ? 'Sócio' : 'Torcedor',
              telefone: solicitacao.telefone,
              cidade: solicitacao.cidade,
              dataNascimentoLabel: solicitacao.dataNascimento
                ? new Date(solicitacao.dataNascimento).toLocaleDateString('pt-BR')
                : null,
              rg: solicitacao.rg,
              cpf: solicitacao.cpf,
              logradouro: solicitacao.logradouro,
              numero: solicitacao.numero,
              bloco: solicitacao.bloco,
              complemento: solicitacao.complemento,
              bairro: solicitacao.bairro,
              cep: solicitacao.cep,
              uf: solicitacao.uf,
              responsavelNome: solicitacao.responsavelNome,
              responsavelDocumento: solicitacao.responsavelDocumento,
              imagemProva: solicitacao.imagemProva,
              fotoDocumentoUrl: solicitacao.fotoDocumentoUrl,
              comprovanteResidenciaUrl: solicitacao.comprovanteResidenciaUrl,
            }}
            titulo="Solicitação registrada"
            descricao="Os anexos do onboarding foram persistidos e já estão vinculados a esta solicitação."
          />
        </div>
      ) : null}

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/portal/comunidade?escopo=nacional"
          className="inline-flex rounded-xl bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-primary-on hover:opacity-90"
        >
          Ir para a comunidade
        </Link>
        <Link
          href="/onboarding"
          className="text-sm font-medium text-[rgb(var(--foreground-muted))] hover:underline"
        >
          Refazer onboarding
        </Link>
      </div>
    </div>
  )
}
