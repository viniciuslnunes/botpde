import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, IdCard } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { formatNomeTorcida, resolverPeriodicidadesOnboarding } from '@torcida/types'
import { getTenantFromHost } from '@/lib/tenant'
import { getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import { carregarPendenciasCadastro } from '@/lib/pendencias-cadastro-server'
import { elegivelPendenciaCadastro } from '@/lib/pendencias-cadastro'
import { preenchidoCompletude } from '@/lib/completude-cadastro-socio'
import {
  AssociacaoAtualizarForm,
  type ValoresAssociacaoForm,
} from './associacao-atualizar-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Completar cadastro' }

const MEMBRO_CAMPOS = {
  tipo: true,
  status: true,
  telefone: true,
  cidade: true,
  numero: true,
  complemento: true,
  anosSocio: true,
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
  adimplente: true,
  aprovadoEm: true,
  sede: { select: { nome: true } },
  departamento: { select: { nome: true } },
} as const

type MembroCampos = {
  tipo: string
  status: string
  telefone: string | null
  cidade: string | null
  numero: string | null
  complemento: string | null
  anosSocio: number | null
  numeroAssociado: string | null
  cpf: string | null
  rg: string | null
  dataNascimento: Date | null
  logradouro: string | null
  bairro: string | null
  cep: string | null
  uf: string | null
  termoResponsabilidadeAceitoEm: Date | null
  imagemProva: string | null
  fotoDocumentoUrl: string | null
  comprovanteResidenciaUrl: string | null
  responsavelNome: string | null
  responsavelDocumento: string | null
  dataExpedicaoCarteirinha: Date | null
  periodicidadePretendida: string | null
  adimplente: boolean
  aprovadoEm: Date | null
  sede: { nome: string } | null
  departamento: { nome: string } | null
}

function scoreCompletude(m: MembroCampos): number {
  const campos = [
    m.numeroAssociado,
    m.cpf,
    m.rg,
    m.dataNascimento,
    m.logradouro,
    m.bairro,
    m.cep,
    m.uf,
    m.termoResponsabilidadeAceitoEm,
    m.imagemProva,
    m.fotoDocumentoUrl,
    m.comprovanteResidenciaUrl,
    m.dataExpedicaoCarteirinha,
    m.periodicidadePretendida,
  ]
  return campos.filter((c) => preenchidoCompletude(c)).length
}

function coalesceStr(
  preferido: string | null | undefined,
  fallback: string | null | undefined,
): string {
  if (preferido?.trim()) return preferido.trim()
  return fallback?.trim() ?? ''
}

function paraValores(
  host: MembroCampos,
  doacao: MembroCampos | null,
): ValoresAssociacaoForm {
  const d = doacao
  return {
    numeroAssociado: coalesceStr(host.numeroAssociado, d?.numeroAssociado),
    cpf: coalesceStr(host.cpf, d?.cpf),
    rg: coalesceStr(host.rg, d?.rg),
    dataNascimento: host.dataNascimento
      ? host.dataNascimento.toISOString().slice(0, 10)
      : d?.dataNascimento
        ? d.dataNascimento.toISOString().slice(0, 10)
        : '',
    telefone: coalesceStr(host.telefone, d?.telefone),
    cidade: coalesceStr(host.cidade, d?.cidade),
    logradouro: coalesceStr(host.logradouro, d?.logradouro),
    numero: coalesceStr(host.numero, d?.numero),
    complemento: coalesceStr(host.complemento, d?.complemento),
    bairro: coalesceStr(host.bairro, d?.bairro),
    cep: coalesceStr(host.cep, d?.cep),
    uf: coalesceStr(host.uf, d?.uf),
    imagemProva: coalesceStr(host.imagemProva, d?.imagemProva),
    fotoDocumentoUrl: coalesceStr(host.fotoDocumentoUrl, d?.fotoDocumentoUrl),
    comprovanteResidenciaUrl: coalesceStr(
      host.comprovanteResidenciaUrl,
      d?.comprovanteResidenciaUrl,
    ),
    responsavelNome: coalesceStr(host.responsavelNome, d?.responsavelNome),
    responsavelDocumento: coalesceStr(host.responsavelDocumento, d?.responsavelDocumento),
    dataExpedicaoIso: host.dataExpedicaoCarteirinha
      ? host.dataExpedicaoCarteirinha.toISOString().slice(0, 10)
      : d?.dataExpedicaoCarteirinha
        ? d.dataExpedicaoCarteirinha.toISOString().slice(0, 10)
        : '',
    periodicidadeAtual: coalesceStr(
      host.periodicidadePretendida,
      d?.periodicidadePretendida,
    ),
    termoAceito: Boolean(
      host.termoResponsabilidadeAceitoEm ?? d?.termoResponsabilidadeAceitoEm,
    ),
    anosSocio:
      host.anosSocio != null
        ? String(host.anosSocio)
        : d?.anosSocio != null
          ? String(d.anosSocio)
          : '',
  }
}

export default async function CadastroAssociacaoPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal/comunidade')

  const membro: MembroCampos | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: MEMBRO_CAMPOS,
  })

  if (!membro || !elegivelPendenciaCadastro(membro)) {
    redirect('/portal/comunidade')
  }
  if (tenant.solicitarPendenciasCadastro === false) {
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

  // Pré-preenche com a ficha mais completa da mesma torcida (ex.: Sede quando
  // a unidade ativa ainda está vazia — caso SUBSEDE ITANHAEM × Gaviões).
  const lineage = await getTorcidaLineageTenantIds(tenant.id)
  const irmaos: (MembroCampos & { tenant: { id: string; nome: string } })[] =
    lineage.length > 1
      ? await db.saasMembro.findMany({
          where: {
            userId: session.user.id,
            tipo: 'SOCIO',
            status: 'APROVADO',
            tenantId: { in: lineage.filter((id) => id !== tenant.id) },
          },
          select: {
            ...MEMBRO_CAMPOS,
            tenant: { select: { id: true, nome: true } },
          },
        })
      : []

  let doacao: MembroCampos | null = null
  let prefillOrigemNome: string | null = null
  if (irmaos.length > 0) {
    const ranked = [...irmaos].sort((a, b) => scoreCompletude(b) - scoreCompletude(a))
    const best = ranked[0]!
    if (scoreCompletude(best) > scoreCompletude(membro)) {
      doacao = best
      prefillOrigemNome = formatNomeTorcida(best.tenant.nome)
    }
  }

  const socioRow: { id: string; validade: Date } | null = await db.saasSocio.findFirst({
    where: { tenantId: tenant.id, userId: session.user.id },
    select: { id: true, validade: true },
  })

  const periodicidades = resolverPeriodicidadesOnboarding(tenant.periodicidadesOnboarding)
  const valores = paraValores(membro, doacao)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-1 pb-8 sm:px-0">
      <div className="space-y-3">
        <Link
          href="/portal/comunidade"
          className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao portal
        </Link>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--color-primary)_/_0.16)] text-[rgb(var(--color-primary-fg))]">
            <IdCard className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-[rgb(var(--foreground))]">
              Completar cadastro de sócio
            </h1>
            <p className="mt-1.5 max-w-prose text-pretty text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
              Mesma organização da ficha no admin — só o que você precisa preencher.
              <br />
              Completar garante a vigência correta; ignorar o aviso deixa o cadastro
              inadimplente.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-[0_12px_40px_rgb(0_0_0_/_0.12)] sm:p-6">
        <AssociacaoAtualizarForm
          valores={valores}
          exigirDocumentos={tenant.exigirDocumentosCadastro}
          temCarteirinha={Boolean(socioRow)}
          periodicidades={periodicidades}
          prefillOrigemNome={prefillOrigemNome}
          operacao={{
            unidadeNome: membro.sede?.nome ? formatNomeTorcida(membro.sede.nome) : null,
            departamentoNome: membro.departamento?.nome ?? null,
            aprovadoEmLabel: membro.aprovadoEm
              ? membro.aprovadoEm.toLocaleDateString('pt-BR')
              : null,
            adimplente: membro.adimplente,
            carteirinhaValidadeLabel: socioRow
              ? socioRow.validade.toLocaleDateString('pt-BR')
              : null,
            statusLabel: 'Aprovado',
          }}
        />
      </div>
    </div>
  )
}
