import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { Pin, MessagesSquare } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comunidade' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(data),
  )
}

// Tipo explícito — o schema tem relações suficientes para o TypeScript
// desistir de inferir o retorno do Prisma silenciosamente (vira implicit any).
interface PostComAutor {
  id: string
  titulo: string | null
  conteudo: string
  imagemUrl: string | null
  fixado: boolean
  criadoEm: Date
  autor: { nome: string | null; avatarUrl: string | null }
}

export default async function ComunidadePage() {
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const posts: PostComAutor[] = await db.post.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
    include: { autor: { select: { nome: true, avatarUrl: true } } },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Comunidade</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Avisos e novidades da torcida
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center">
          <MessagesSquare className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
          <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
            Nenhum post por aqui ainda
          </p>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Fique de olho — novidades em breve!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className={[
                'rounded-xl border p-5',
                post.fixado
                  ? 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.04)]'
                  : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center gap-2">
                {post.fixado && (
                  <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                    <Pin className="h-3 w-3" /> Fixado
                  </span>
                )}
                {post.titulo && (
                  <h2 className="font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h2>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                {post.conteudo}
              </p>

              {post.imagemUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.imagemUrl}
                  alt=""
                  className="mt-3 max-h-96 w-full rounded-lg border border-[rgb(var(--border))] object-cover"
                />
              )}

              <div className="mt-3 flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <span>{post.autor.nome ?? 'Administração'}</span>
                <span>·</span>
                <span>{formatarData(post.criadoEm)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
