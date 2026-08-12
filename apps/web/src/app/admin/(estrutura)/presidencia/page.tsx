import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@torcida/db'
import { formatNomeUnidade, PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { labelTipoUnidade } from '@/lib/torcida-labels'
import {
  candidatosLideranca,
  liderancaAtualDoTenant,
  type CandidatoLideranca,
  type LiderAtual,
} from '@/lib/lideranca'
import { PresidenciaConsole, type UnidadeLideranca } from './presidencia-console'

export const metadata: Metadata = { title: 'Presidência — Estrutura' }

/**
 * Sucessão da própria unidade. A permissão `leadership:transfer` só existe no
 * pacote `owner`, então quem chega aqui é o presidente — a página não gateia
 * por cargo, e sim pela permissão, como todo o admin.
 */
export default async function PresidenciaPage() {
  // Sem a permissão a etapa nem aparece nas tabs; quem chega por deep link
  // volta para a Visão geral em vez de ver um erro.
  const ctx = await assertPermission(PERMISSIONS.LEADERSHIP_TRANSFER).catch(() => null)
  if (!ctx) redirect('/admin/torcida')

  const { tenant, session } = ctx

  const [presidentes, candidatos, sedes]: [
    LiderAtual[],
    CandidatoLideranca[],
    {
      id: string
      nome: string
      tipo: string
      sedeId: string | null
      responsavelUserId: string | null
      responsavelUser: { nome: string | null; email: string | null } | null
    }[],
  ] = await Promise.all([
    liderancaAtualDoTenant(tenant.id),
    candidatosLideranca(tenant.id),
    db.sede.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        nome: true,
        tipo: true,
        sedeId: true,
        responsavelUserId: true,
        responsavelUser: { select: { nome: true, email: true } },
      },
      orderBy: { nome: 'asc' },
    }),
  ])

  // Sedes de outro tenant referenciadas como pai: identificam a unidade que
  // *é* este portal (Caso B) — ela não é uma "unidade interna" para gerir aqui.
  const idsPaisExternos = new Set(
    (
      await db.sede.findMany({
        where: {
          id: { in: sedes.map((s) => s.sedeId).filter((v): v is string => Boolean(v)) },
          tenantId: { not: tenant.id },
        },
        select: { id: true },
      })
    ).map((s: { id: string }) => s.id),
  )

  const raizId = sedes.find((s) => s.tipo === 'SEDE')?.id ?? null

  const unidades: UnidadeLideranca[] = sedes
    .filter((s) => s.id !== raizId && !(s.sedeId && idsPaisExternos.has(s.sedeId)))
    .map((s) => ({
      sedeId: s.id,
      nome: formatNomeUnidade(s.nome),
      tipoLabel: labelTipoUnidade(s.tipo),
      lider: s.responsavelUserId
        ? {
            userId: s.responsavelUserId,
            nome: s.responsavelUser?.nome ?? null,
            email: s.responsavelUser?.email ?? null,
          }
        : null,
    }))

  return (
    <PresidenciaConsole
      tenantNome={tenant.nome}
      meuUserId={session.user.id}
      presidentes={presidentes}
      candidatos={candidatos}
      unidades={unidades}
    />
  )
}
