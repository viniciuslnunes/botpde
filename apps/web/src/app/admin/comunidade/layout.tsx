import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { LayoutDashboard, Megaphone, MessagesSquare, Newspaper, ShieldAlert } from 'lucide-react'
import { db } from '@torcida/db'
import { PERMISSIONS, hasPermission } from '@torcida/types'
import { montarTabsModulo, permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { getTenantFromHost } from '@/lib/tenant'
import { AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'

const ICONE = 'h-4 w-4 shrink-0'

export default async function ComunidadeModuloLayout({ children }: { children: ReactNode }) {
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/admin')

  const permissoes = await permissoesEfetivasNoAdmin()
  const tabsBase = montarTabsModulo('comunidade', permissoes)
  // Sem nenhuma etapa acessível não há módulo a mostrar; cada rota mantém o
  // próprio gate, isto aqui é só para não renderizar uma barra vazia.
  if (tabsBase.length === 0) redirect('/admin')

  const podeModerarPosts = hasPermission(permissoes, PERMISSIONS.COMMUNITY_MODERATE)
  const podeModerarMensagens = hasPermission(permissoes, PERMISSIONS.MESSAGES_MODERATE)
  const podeCurarNoticias = hasPermission(permissoes, PERMISSIONS.NEWS_CURATE)

  // A tabela de denúncias de mensagem pode não existir em bases antigas: catch → 0.
  const [denunciasPost, denunciasMensagem, noticiasPendentes]: [number, number, number] =
    await Promise.all([
      podeModerarPosts
        ? db.denuncia.count({ where: { tenantId: tenant.id, status: 'PENDENTE' } })
        : Promise.resolve(0),
      podeModerarMensagens
        ? db.denunciaMensagem
            .count({ where: { tenantId: tenant.id, status: 'PENDENTE' } })
            .catch(() => 0)
        : Promise.resolve(0),
      // Notícia é referência global: filtra pela afiliação do tenant, não por tenantId.
      podeCurarNoticias && tenant.afiliacaoId
        ? db.noticia.count({ where: { afiliacaoId: tenant.afiliacaoId, status: 'RASCUNHO' } })
        : Promise.resolve(0),
    ])

  const alerta = 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]'

  const tabs = montarTabsModulo('comunidade', permissoes, {
    'visao-geral': { icon: <LayoutDashboard className={ICONE} /> },
    comunicados: { icon: <Megaphone className={ICONE} /> },
    mural: { icon: <MessagesSquare className={ICONE} /> },
    moderacao: {
      icon: <ShieldAlert className={ICONE} />,
      count: denunciasPost + denunciasMensagem,
      countClass: alerta,
    },
    noticias: {
      icon: <Newspaper className={ICONE} />,
      count: noticiasPendentes,
      countClass: alerta,
    },
  })

  return (
    <>
      <AdminPageHeader
        title="Comunidade"
        description="Comunicados oficiais, mural, moderação e curadoria de notícias."
        icon={<MessagesSquare className="h-5 w-5" />}
      />

      <div className="app-container space-y-6 py-6">
        <AdminModuleTabs tabs={tabs}>{children}</AdminModuleTabs>
      </div>
    </>
  )
}
