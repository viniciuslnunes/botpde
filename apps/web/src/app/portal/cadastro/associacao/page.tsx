import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { resolverPeriodicidadesOnboarding } from '@torcida/types'
import { getTenantFromHost } from '@/lib/tenant'
import { carregarPendenciasCadastro } from '@/lib/pendencias-cadastro-server'
import { AssociacaoAtualizarForm } from './associacao-atualizar-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Completar cadastro de sócio' }

export default async function CadastroAssociacaoPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal/comunidade')

  const membro = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: {
      tipo: true,
      status: true,
      numeroAssociado: true,
      cpf: true,
      rg: true,
      dataNascimento: true,
      logradouro: true,
      bairro: true,
      cep: true,
      uf: true,
      termoResponsabilidadeAceitoEm: true,
      imagemProva: true,
      fotoDocumentoUrl: true,
      comprovanteResidenciaUrl: true,
      responsavelNome: true,
      responsavelDocumento: true,
      dataExpedicaoCarteirinha: true,
      periodicidadePretendida: true,
    },
  })

  if (!membro || membro.tipo !== 'SOCIO' || membro.status !== 'APROVADO') {
    redirect('/portal/comunidade')
  }

  const snap = await carregarPendenciasCadastro(tenant.id, session.user.id)
  if (!snap || snap.ativas.length === 0) {
    const tem: { id: string } | null = await db.saasSocio.findFirst({
      where: { tenantId: tenant.id, userId: session.user.id },
      select: { id: true },
    })
    if (tem) redirect('/portal/carteirinha')
    redirect('/portal/comunidade')
  }

  const pendencia = snap.ativas[0]!
  const socioRow = await db.saasSocio.findFirst({
    where: { tenantId: tenant.id, userId: session.user.id },
    select: { id: true },
  })

  const periodicidades = resolverPeriodicidadesOnboarding(tenant.periodicidadesOnboarding)

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href="/portal/comunidade"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao portal
        </Link>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
          Completar cadastro de sócio
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Os mesmos campos obrigatórios da ficha no admin. Ao concluir, a carteirinha digital
          pode ser emitida automaticamente.
        </p>
      </div>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <AssociacaoAtualizarForm
          faltantes={pendencia.camposFaltantes}
          progresso={pendencia.progresso ?? { ok: 0, total: pendencia.camposFaltantes.length }}
          exigirDocumentos={tenant.exigirDocumentosCadastro}
          temCarteirinha={Boolean(socioRow)}
          periodicidades={periodicidades}
          valores={{
            numeroAssociado: membro.numeroAssociado?.trim() ?? '',
            cpf: membro.cpf ?? '',
            rg: membro.rg ?? '',
            dataNascimento: membro.dataNascimento
              ? membro.dataNascimento.toISOString().slice(0, 10)
              : '',
            logradouro: membro.logradouro ?? '',
            bairro: membro.bairro ?? '',
            cep: membro.cep ?? '',
            uf: membro.uf ?? '',
            imagemProva: membro.imagemProva ?? '',
            fotoDocumentoUrl: membro.fotoDocumentoUrl ?? '',
            comprovanteResidenciaUrl: membro.comprovanteResidenciaUrl ?? '',
            responsavelNome: membro.responsavelNome ?? '',
            responsavelDocumento: membro.responsavelDocumento ?? '',
            dataExpedicaoIso: membro.dataExpedicaoCarteirinha
              ? membro.dataExpedicaoCarteirinha.toISOString().slice(0, 10)
              : '',
            periodicidadeAtual: membro.periodicidadePretendida ?? '',
            termoAceito: Boolean(membro.termoResponsabilidadeAceitoEm),
          }}
        />
      </div>
    </div>
  )
}
