import { redirect } from 'next/navigation'
import { MemoriaMark } from '@/components/portal/memoria-mark'
import { PERMISSIONS, hasPermission } from '@torcida/types'
import { db } from '@torcida/db'
import { contextoAdmin } from '@/lib/admin-modulos'
import { TableShell } from '@/components/admin/ui'
import { formatDateOnlyIso, formatDateTimeShort, zonedDateParts } from '@/lib/format-datetime'
import { MemoriaFilaClient } from './memoria-fila-client'
import { MemoriaCapitulosAdmin } from './memoria-capitulos-admin'
import {
  carregarCapitulosMemoria,
  podeGerirAcervoMemoria,
} from '@/app/portal/memoria/_lib/memoria-capitulos'
import { auth } from '@/lib/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Memórias — Comunidade' }

type FatoPendente = {
  id: string
  dia: Date
  conteudo: string
  visibilidade: 'PUBLICO' | 'TENANT'
  criadoEm: Date
  eventoId: string | null
  postId: string | null
  autor: { nome: string | null; nickname: string | null }
  evento: { titulo: string } | null
  post: { conteudo: string } | null
}

export default async function AdminMemoriaPage() {
  const { tenant, permissoes } = await contextoAdmin()
  if (!hasPermission(permissoes, PERMISSIONS.COMMUNITY_MODERATE)) {
    redirect('/admin/comunidade')
  }

  const session = await auth()
  const userId = session?.user?.id ?? null

  const [fatos, capitulos, podeGerirAcervo]: [
    FatoPendente[],
    Awaited<ReturnType<typeof carregarCapitulosMemoria>>,
    boolean,
  ] = await Promise.all([
    db.memoriaFato.findMany({
      where: { tenantId: tenant.id, status: 'PENDENTE' },
      orderBy: { criadoEm: 'asc' },
      select: {
        id: true,
        dia: true,
        conteudo: true,
        visibilidade: true,
        criadoEm: true,
        eventoId: true,
        postId: true,
        autor: { select: { nome: true, nickname: true } },
        evento: { select: { titulo: true } },
        post: { select: { conteudo: true } },
      },
      take: 80,
    }),
    carregarCapitulosMemoria(tenant.id),
    userId ? podeGerirAcervoMemoria(userId, tenant.id) : Promise.resolve(false),
  ])

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Fatos ligados a um dia depois — só entram na linha do tempo depois da aprovação.
        Não reescrevem a data do post no mural.
      </p>
      <TableShell
        title="Fila da memória"
        isEmpty={fatos.length === 0}
        empty={{
          icon: <MemoriaMark className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />,
          title: 'Nada pendente',
          description: 'Quando alguém ligar um relato a um dia passado, aparece aqui.',
        }}
      >
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            <th className="px-3 py-2">Dia</th>
            <th className="px-3 py-2">Fato</th>
            <th className="px-3 py-2">Recusa</th>
            <th className="px-3 py-2">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <MemoriaFilaClient
          fatos={fatos.map((f) => ({
            id: f.id,
            diaIso: formatDateOnlyIso(zonedDateParts(f.dia)),
            conteudo: f.conteudo,
            visibilidade: f.visibilidade,
            autorNome: f.autor.nickname || f.autor.nome || 'Membro',
            criadoEmLabel: formatDateTimeShort(f.criadoEm),
            vinculoEvento: f.evento?.titulo ?? null,
            vinculoPost: f.post?.conteudo?.trim().slice(0, 80) ?? null,
          }))}
        />
      </TableShell>

      <MemoriaCapitulosAdmin capitulos={capitulos} podeGerir={podeGerirAcervo} />
    </div>
  )
}
