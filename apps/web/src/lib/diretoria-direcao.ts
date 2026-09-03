import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { DEPARTAMENTOS_CANONICOS_SLUGS, resumirConformidadeLge } from '@torcida/types'
import {
  ADMIN_DIRECAO_TTL,
  tagAdminDirecao,
} from '@/lib/admin-direcao-cache'
import { slaLabel, type AdminInboxItem } from '@/lib/admin-inbox'

export type DiretoriaDeptoSaude = {
  id: string
  slug: string
  nome: string
  gestores: number
}

export type DiretoriaOpsResumo = {
  departamentoId: string | null
  departamentoSlug: string
  membrosPendentes: number
  sociosAtivos: number
  carteirinhasVencidas: number
  denunciasPendentes: number
  pedidosLojaPendentes: number
  deptosSemGestor: DiretoriaDeptoSaude[]
  deptosOk: number
  lgeIncompletos: number
  lgeSemCpf: number
  lgeSemRg: number
  pendencias: AdminInboxItem[]
}

async function fetchDirecaoDiretoria(tenantId: string): Promise<DiretoriaOpsResumo> {
  const agora = new Date()

  type DeptoRow = { id: string; slug: string }
  type DeptoHealthRow = {
    id: string
    slug: string
    nome: string
    _count: { gestores: number }
  }
  type MembroPendente = {
    id: string
    nome: string
    tipo: string
    criadoEm: Date
    user: { email: string }
  }

  const depto: DeptoRow | null = await db.departamento.findFirst({
    where: { tenantId, slug: 'diretoria' },
    select: { id: true, slug: true },
  })

  type SocioLgeRow = {
    userId: string
    nome: string
    tipo: string
    idade: number | null
    cpf: string | null
    rg: string | null
    dataNascimento: Date | null
    logradouro: string | null
    bairro: string | null
    cep: string | null
    uf: string | null
    termoResponsabilidadeAceitoEm: Date | null
    imagemProva: string | null
    responsavelNome: string | null
    responsavelDocumento: string | null
    autorizacaoMenorAceitaEm: Date | null
    fotoDocumentoUrl: string | null
    comprovanteResidenciaUrl: string | null
    dataExpedicaoCarteirinha: Date | null
    numeroAssociado: string | null
  }

  const [
    membrosPendentes,
    sociosAtivos,
    carteirinhasVencidas,
    denunciasPendentes,
    pedidosLojaPendentes,
    deptosCanon,
    filaTop,
    sociosLge,
  ]: [number, number, number, number, number, DeptoHealthRow[], MembroPendente[], SocioLgeRow[]] =
    await Promise.all([
      db.saasMembro.count({ where: { tenantId, status: 'PENDENTE' } }),
      db.saasSocio.count({ where: { tenantId } }),
      db.saasSocio.count({ where: { tenantId, validade: { lt: agora } } }),
      db.denuncia.count({ where: { tenantId, status: 'PENDENTE' } }),
      db.saasPedido.count({ where: { tenantId, status: 'PENDENTE' } }),
      db.departamento.findMany({
        where: { tenantId, slug: { in: [...DEPARTAMENTOS_CANONICOS_SLUGS] } },
        select: {
          id: true,
          slug: true,
          nome: true,
          _count: { select: { gestores: true } },
        },
        orderBy: { ordem: 'asc' },
      }),
      db.saasMembro.findMany({
        where: { tenantId, status: 'PENDENTE' },
        orderBy: { criadoEm: 'asc' },
        take: 5,
        select: {
          id: true,
          nome: true,
          tipo: true,
          criadoEm: true,
          user: { select: { email: true } },
        },
      }),
      db.saasMembro.findMany({
        where: { tenantId, tipo: 'SOCIO', status: 'APROVADO', desligadoEm: null },
        select: {
          userId: true,
          nome: true,
          tipo: true,
          idade: true,
          cpf: true,
          rg: true,
          dataNascimento: true,
          logradouro: true,
          bairro: true,
          cep: true,
          uf: true,
          termoResponsabilidadeAceitoEm: true,
          imagemProva: true,
          responsavelNome: true,
          responsavelDocumento: true,
          autorizacaoMenorAceitaEm: true,
          fotoDocumentoUrl: true,
          comprovanteResidenciaUrl: true,
          dataExpedicaoCarteirinha: true,
          numeroAssociado: true,
        },
      }),
    ])

  const deptosSemGestor: DiretoriaDeptoSaude[] = deptosCanon
    .filter((d) => d._count.gestores === 0)
    .map((d) => ({
      id: d.id,
      slug: d.slug,
      nome: d.nome,
      gestores: 0,
    }))

  const deptosOk = deptosCanon.length - deptosSemGestor.length
  const lge = resumirConformidadeLge(sociosLge)
  const pendencias: AdminInboxItem[] = []

  if (!depto) {
    pendencias.push({
      id: 'sem-depto',
      titulo: 'Departamento Diretoria não encontrado',
      detalhe: 'Rode o seed de departamentos neste tenant.',
      href: '/admin/departamentos',
      tom: 'warning',
    })
  }

  for (const m of filaTop) {
    const sla = slaLabel(m.criadoEm, { agora, modo: 'idade' })
    pendencias.push({
      id: `mem-${m.id}`,
      titulo: `${m.nome} · ${m.tipo === 'SOCIO' ? 'Sócio' : 'Torcedor'}`,
      detalhe: m.user.email,
      href: `/admin/membros?status=PENDENTE`,
      tom: sla.startsWith('D+') && Number(sla.slice(2)) >= 7 ? 'danger' : 'warning',
      sla,
      acao: { tipo: 'aprovar_membro', membroId: m.id, label: 'Aprovar' },
    })
  }

  if (membrosPendentes > filaTop.length) {
    pendencias.push({
      id: 'fila-mais',
      titulo: `+${membrosPendentes - filaTop.length} na fila de admissão`,
      detalhe: 'Ver todos em Membros.',
      href: '/admin/membros?status=PENDENTE',
      tom: 'warning',
    })
  }

  if (carteirinhasVencidas > 0) {
    pendencias.push({
      id: 'lge-vencida',
      titulo: `${carteirinhasVencidas} carteirinha${carteirinhasVencidas === 1 ? '' : 's'} vencida${carteirinhasVencidas === 1 ? '' : 's'}`,
      detalhe: 'Revise validade LGE em Sócios.',
      href: '/admin/socios',
      tom: 'warning',
    })
  }

  if (lge.incompletos > 0) {
    pendencias.push({
      id: 'lge-incompletos',
      titulo: `${lge.incompletos} sócio${lge.incompletos === 1 ? '' : 's'} com cadastro LGE incompleto`,
      detalhe:
        lge.semCpf > 0 || lge.semRg > 0
          ? `${lge.semCpf} sem CPF · ${lge.semRg} sem RG — exigência para manifesto e viagem.`
          : 'Revise documentos e termo de responsabilidade em Sócios.',
      href: '/admin/socios',
      tom: lge.incompletos >= 5 ? 'danger' : 'warning',
    })
  }

  if (deptosSemGestor.length > 0) {
    const amostra = deptosSemGestor
      .slice(0, 3)
      .map((d) => d.nome)
      .join(', ')
    pendencias.push({
      id: 'deptos-sem-gestor',
      titulo: `${deptosSemGestor.length} departamento${deptosSemGestor.length === 1 ? '' : 's'} sem gestor`,
      detalhe: amostra + (deptosSemGestor.length > 3 ? '…' : ''),
      href: '/admin/departamentos',
      tom: deptosSemGestor.length >= 3 ? 'danger' : 'warning',
    })
  }

  if (denunciasPendentes > 0) {
    pendencias.push({
      id: 'denuncias',
      titulo: `${denunciasPendentes} denúncia${denunciasPendentes === 1 ? '' : 's'} aberta${denunciasPendentes === 1 ? '' : 's'}`,
      detalhe: 'Moderação na Comunidade.',
      href: '/admin/comunidade/moderacao',
      tom: 'default',
    })
  }

  if (pedidosLojaPendentes > 0) {
    pendencias.push({
      id: 'loja-pedidos',
      titulo: `${pedidosLojaPendentes} pedido${pedidosLojaPendentes === 1 ? '' : 's'} de loja pendente${pedidosLojaPendentes === 1 ? '' : 's'}`,
      detalhe: 'Acompanhe em Loja.',
      href: '/admin/loja',
      tom: 'default',
    })
  }

  return {
    departamentoId: depto?.id ?? null,
    departamentoSlug: depto?.slug ?? 'diretoria',
    membrosPendentes,
    sociosAtivos,
    carteirinhasVencidas,
    denunciasPendentes,
    pedidosLojaPendentes,
    deptosSemGestor,
    deptosOk,
    lgeIncompletos: lge.incompletos,
    lgeSemCpf: lge.semCpf,
    lgeSemRg: lge.semRg,
    pendencias: pendencias.slice(0, 12),
  }
}

/**
 * Prancheta da Diretoria — filas + saúde dos deptos + ações de aprovação.
 */
export const carregarDirecaoDiretoria = cache(async function carregarDirecaoDiretoria(
  tenantId: string,
): Promise<DiretoriaOpsResumo> {
  return unstable_cache(
    () => fetchDirecaoDiretoria(tenantId),
    ['admin-direcao-diretoria', tenantId],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
