'use client'

import { useRouter } from 'next/navigation'
import { ExternalLink, Star, UserMinus } from 'lucide-react'
import { AdminRowActions } from '@/components/admin/ui'
import {
  definirResponsavelArea,
  removerMembroAreaDepartamento,
} from '@/app/portal/departamentos/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { runPersistAction } from '@/lib/toast-action'

export function EquipeRowAcoes({
  areaId,
  areaNome,
  departamentoId,
  slug,
  userId,
  pessoaNome,
  papel,
  hrefPessoa,
}: {
  areaId: string
  areaNome: string
  departamentoId: string
  slug: string
  userId: string
  pessoaNome: string
  papel: string
  hrefPessoa: string
}) {
  const router = useRouter()
  const confirmAction = useConfirmAction()
  const isResponsavel = papel === 'RESPONSAVEL'

  function fdPapel(proximo: 'MEMBRO' | 'RESPONSAVEL') {
    const fd = new FormData()
    fd.set('areaId', areaId)
    fd.set('departamentoId', departamentoId)
    fd.set('slug', slug)
    fd.set('targetUserId', userId)
    fd.set('papel', proximo)
    return fd
  }

  return (
    <td className="px-4 py-3 text-right">
      <AdminRowActions
        ariaLabel={`Ações de ${pessoaNome} em ${areaNome}`}
        items={[
          {
            id: 'papel',
            label: isResponsavel ? 'Tornar membro' : 'Nomear responsável',
            icon: Star,
            onSelect: () => {
              const proximo = isResponsavel ? 'MEMBRO' : 'RESPONSAVEL'
              void runPersistAction(() => definirResponsavelArea({}, fdPapel(proximo)), {
                success: isResponsavel
                  ? `${pessoaNome} voltou a membro`
                  : `${pessoaNome} é responsável de ${areaNome}`,
                successDescription: isResponsavel
                  ? undefined
                  : 'Isso não concede permissão extra — só accountability.',
              }).then((ok) => {
                if (ok) router.refresh()
              })
            },
          },
          {
            id: 'abrir',
            label: 'Abrir no departamento',
            icon: ExternalLink,
            onSelect: () => {
              router.push(hrefPessoa)
            },
          },
          {
            id: 'remover',
            label: 'Remover da área',
            icon: UserMinus,
            tone: 'danger',
            onSelect: () => {
              void confirmAction({
                titulo: `Remover ${pessoaNome} de ${areaNome}?`,
                descricao: 'A pessoa continua no departamento; só sai desta área.',
                labelConfirmar: 'Remover',
                variante: 'destructive',
                cancelled: false,
                run: async () => {
                  const fd = new FormData()
                  fd.set('areaId', areaId)
                  fd.set('departamentoId', departamentoId)
                  fd.set('slug', slug)
                  fd.set('targetUserId', userId)
                  return removerMembroAreaDepartamento({}, fd)
                },
                success: `${pessoaNome} saiu de ${areaNome}`,
              }).then((ok) => {
                if (ok) router.refresh()
              })
            },
          },
        ]}
      />
    </td>
  )
}
