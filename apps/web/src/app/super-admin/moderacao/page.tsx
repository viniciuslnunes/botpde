import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ShieldAlert } from 'lucide-react'
import { db } from '@torcida/db'
import { formatNomeTorcida } from '@torcida/types'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { TableShell } from '@/components/admin/ui/table-shell'
import { ModeracaoActionsButtons } from './moderacao-actions-buttons'

export const metadata: Metadata = { title: 'Moderação — Super Admin' }

type DenunciaPostRow = {
  id: string
  motivo: string
  criadoEm: Date
  tenant: { id: string; nome: string; slug: string }
  post: { id: string; conteudo: string; autor: { nome: string | null } }
  denunciante: { nome: string | null; email: string | null }
}

type DenunciaMensagemRow = {
  id: string
  motivo: string
  criadoEm: Date
  tenant: { id: string; nome: string; slug: string }
  denunciante: { nome: string | null; email: string | null }
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default async function ModeracaoPlataformaPage() {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const [denunciasPost, denunciasMensagem]: [DenunciaPostRow[], DenunciaMensagemRow[]] = await Promise.all([
    db.denuncia.findMany({
      where: { status: 'PENDENTE' },
      orderBy: { criadoEm: 'asc' },
      take: 100,
      select: {
        id: true,
        motivo: true,
        criadoEm: true,
        tenant: { select: { id: true, nome: true, slug: true } },
        post: { select: { id: true, conteudo: true, autor: { select: { nome: true } } } },
        denunciante: { select: { nome: true, email: true } },
      },
    }),
    db.denunciaMensagem.findMany({
      where: { status: 'PENDENTE' },
      orderBy: { criadoEm: 'asc' },
      take: 100,
      select: {
        id: true,
        motivo: true,
        criadoEm: true,
        tenant: { select: { id: true, nome: true, slug: true } },
        denunciante: { select: { nome: true, email: true } },
      },
    }),
  ])

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Moderação — plataforma"
        description="Fila consolidada de denúncias pendentes de todas as torcidas. Resolver oculta o post ou remove a mensagem; descartar só encerra a denúncia."
        icon={<ShieldAlert className="h-5 w-5" />}
      />

      <div className="app-container min-w-0 flex-1 space-y-8 py-5 sm:py-8">
        <TableShell
          title={`Posts denunciados (${denunciasPost.length})`}
          isEmpty={denunciasPost.length === 0}
          empty={{
            icon: <ShieldAlert className="h-6 w-6" />,
            title: 'Nenhum post denunciado pendente',
            description: 'Fila zerada em todas as torcidas.',
          }}
        >
          <thead className="bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Torcida</th>
              <th className="px-3 py-2 text-left font-semibold">Post</th>
              <th className="px-3 py-2 text-left font-semibold">Motivo / denunciante</th>
              <th className="px-3 py-2 text-left font-semibold">Quando</th>
              <th className="px-3 py-2 text-left font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {denunciasPost.map((d) => (
              <tr key={d.id} className="align-top">
                <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                  <span className="font-medium">{formatNomeTorcida(d.tenant.nome)}</span>
                  <span className="ml-1 font-mono text-xs text-[rgb(var(--foreground-muted))]">{d.tenant.slug}</span>
                </td>
                <td className="max-w-xs px-3 py-2 text-[rgb(var(--foreground))]">
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">{d.post.autor.nome ?? 'Autor desconhecido'}</p>
                  <p className="line-clamp-2">{d.post.conteudo}</p>
                </td>
                <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                  <p>{d.motivo}</p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {d.denunciante.nome ?? d.denunciante.email ?? 'Anônimo'}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[rgb(var(--foreground-muted))]">
                  {formatarData(d.criadoEm)}
                </td>
                <td className="px-3 py-2">
                  <ModeracaoActionsButtons denunciaId={d.id} tipo="post" />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>

        <TableShell
          title={`Mensagens denunciadas (${denunciasMensagem.length})`}
          isEmpty={denunciasMensagem.length === 0}
          empty={{
            icon: <ShieldAlert className="h-6 w-6" />,
            title: 'Nenhuma mensagem denunciada pendente',
            description: 'Fila zerada em todas as torcidas.',
          }}
        >
          <thead className="bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Torcida</th>
              <th className="px-3 py-2 text-left font-semibold">Motivo / denunciante</th>
              <th className="px-3 py-2 text-left font-semibold">Quando</th>
              <th className="px-3 py-2 text-left font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {denunciasMensagem.map((d) => (
              <tr key={d.id} className="align-top">
                <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                  <span className="font-medium">{formatNomeTorcida(d.tenant.nome)}</span>
                  <span className="ml-1 font-mono text-xs text-[rgb(var(--foreground-muted))]">{d.tenant.slug}</span>
                </td>
                <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                  <p>{d.motivo}</p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {d.denunciante.nome ?? d.denunciante.email ?? 'Anônimo'}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[rgb(var(--foreground-muted))]">
                  {formatarData(d.criadoEm)}
                </td>
                <td className="px-3 py-2">
                  <ModeracaoActionsButtons denunciaId={d.id} tipo="mensagem" />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>

        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Conteúdo de mensagens diretas não é exibido aqui por minimização de dados — só o motivo da denúncia.
        </p>
      </div>
    </div>
  )
}
