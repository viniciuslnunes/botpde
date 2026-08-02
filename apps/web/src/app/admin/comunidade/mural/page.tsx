import { db } from '@torcida/db'
import { contextoAdmin } from '@/lib/admin-modulos'
import { redirect } from 'next/navigation'
import { PERMISSIONS, hasPermission } from '@torcida/types'
import { AdminCreateDisclosure } from '@/components/admin/ui'
import { CriarPostForm, PostsManager } from '@/components/admin/post-forms'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mural — Comunidade' }

export default async function AdminMuralPage() {
  const { tenant, permissoes: effective } = await contextoAdmin()
  const podeGerir = hasPermission(effective, PERMISSIONS.COMMUNITY_MANAGE)
  const podeVer = hasPermission(effective, PERMISSIONS.COMMUNITY_VIEW)
  if (!podeGerir && !podeVer) redirect('/admin/comunidade')

  const posts = await db.post.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
    select: { id: true, titulo: true, conteudo: true, imagemUrl: true, fixado: true, criadoEm: true },
  })

  return (
    <>
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        {podeGerir
          ? 'Avisos internos publicados no mural, fora do fluxo de comunicados oficiais.'
          : 'Somente leitura — avisos internos do mural.'}
      </p>

      {podeGerir ? (
        <MotionReveal>
          <AdminCreateDisclosure label="Novo post" title="Novo post no mural">
            <CriarPostForm />
          </AdminCreateDisclosure>
        </MotionReveal>
      ) : null}
      <MotionReveal index={1}>
        <PostsManager posts={posts} podeGerir={podeGerir} />
      </MotionReveal>
    </>
  )
}
