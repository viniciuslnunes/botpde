import dynamic from 'next/dynamic'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'

const FeedComposer = dynamic(
  () => import('@/components/portal/feed-composer').then((mod) => mod.FeedComposer),
  {
    loading: () => (
      <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    ),
  },
)

/**
 * Composer rico (mesmo usado no feed da Comunidade) para publicar
 * comunicados oficiais no admin — com prévia fiel de como o comunicado
 * vai aparecer no feed antes de publicar. Ver `FeedComposer` modo
 * `comunicado` e `publicarComunicadoComposer` em
 * apps/web/src/app/admin/comunidade/actions.ts.
 */
export async function ComunicadoComposerAdmin() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) return null

  const departamentos = await db.departamento.findMany({
    where: { tenantId: tenant.id },
    orderBy: { ordem: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <FeedComposer
      comunicado
      departamentosComunicado={departamentos}
      userId={session.user.id}
      userName={session.user.name ?? null}
      userAvatar={typeof session.user.image === 'string' ? session.user.image : null}
      tenantId={tenant.id}
      tenantNome={tenant.nome}
    />
  )
}
