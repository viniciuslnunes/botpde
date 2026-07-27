import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { buildPortalUrl, getActiveTenant } from '@/lib/tenant'
import { SolicitacaoResumoCard } from '@/components/onboarding/solicitacao-resumo-card'

export default async function SolicitacaoEnviadaPage({
  searchParams,
}: {
  searchParams: Promise<{ torcida?: string }>
}) {
  const [params, session] = await Promise.all([searchParams, auth()])
  if (!session?.user?.id) redirect('/entrar')

  const hostTenant = await getActiveTenant(session.user.id, session.user.email)

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

  const portalUrl = torcida ? buildPortalUrl(torcida.slug) : '/portal/comunidade'
  const portalExterno = portalUrl.startsWith('http')

  return (
    <div className="flex flex-1 flex-col justify-center py-12 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
      <h1 className="mt-4 text-2xl font-bold text-[rgb(var(--foreground))]">
        Solicitação enviada
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--foreground-muted))]">
        {torcida ? (
          <>
            Sua solicitação foi registrada na <strong>{torcida.nome}</strong>. Enquanto a
            liderança analisa, você pode usar o feed de torcedor e interagir com outros
            torcedores do clube.
          </>
        ) : (
          <>Sua solicitação foi registrada. A liderança da torcida vai analisar em breve.</>
        )}
      </p>

      {hostTenant && torcida && hostTenant.slug !== torcida.slug && (
        <p className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Seu contexto foi ajustado para a <strong>{torcida.nome}</strong>. A aprovação é feita
          pela diretoria dessa torcida.
        </p>
      )}

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
        {portalExterno ? (
          <a
            href={portalUrl}
            className="inline-flex rounded-xl bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Ir para o feed de torcedor
          </a>
        ) : (
          <Link
            href={portalUrl}
            className="inline-flex rounded-xl bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Voltar ao portal
          </Link>
        )}
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
