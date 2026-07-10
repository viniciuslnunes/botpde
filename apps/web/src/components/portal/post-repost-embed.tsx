import Link from 'next/link'
import { Avatar } from './avatar'
import { PostConteudoRich } from './post-conteudo-rich'
import type { PostOrigemEmbed } from '@/lib/feed'

interface PostRepostEmbedProps {
  origem: PostOrigemEmbed
}

export function PostRepostEmbed({ origem }: PostRepostEmbedProps) {
  if (origem.oculto) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-4 text-sm text-[rgb(var(--foreground-muted))]">
        Publicação original indisponível.
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
      <div className="mb-2 flex items-center gap-2">
        <Avatar nome={origem.autor.nome} avatarUrl={origem.autor.avatarUrl} size="xs" />
        <Link
          href={`/portal/comunidade/perfil/${origem.autor.id}`}
          className="text-xs font-semibold hover:underline"
        >
          {origem.autor.nome ?? 'Membro'}
        </Link>
      </div>
      <PostConteudoRich
        conteudo={origem.conteudo}
        className="line-clamp-4 text-sm text-[rgb(var(--foreground))]"
      />
    </div>
  )
}
