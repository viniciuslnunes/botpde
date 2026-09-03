import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Box, ExternalLink, MapPin, UserRound, XCircle } from 'lucide-react'
import { db } from '@torcida/db'
import { garantirCategoriaPermitida } from '@/lib/patrimonio-authz'
import { assertAcervoView } from '@/lib/patrimonio-authz'
import { lerQrItemPatrimonio } from '@/lib/patrimonio-qr'
import { extrairPayloadDeQr } from '@/lib/qr-token'

export const metadata: Metadata = { title: 'Item do acervo' }

type Props = { searchParams: Promise<{ t?: string }> }

const STATUS_LABEL: Record<string, string> = {
  DISPONIVEL: 'Disponível',
  EM_USO: 'Em uso',
  MANUTENCAO: 'Em manutenção',
  BAIXADO: 'Baixado',
}

const CATEGORIA_LABEL: Record<string, string> = {
  INSTRUMENTO: 'Instrumento',
  BANDEIRA: 'Bandeira',
  UNIFORME: 'Uniforme',
  MOBILIARIO: 'Mobiliário',
  ELETRONICO: 'Eletrônico',
  ESPACO: 'Espaço',
  OUTROS: 'Outros',
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <XCircle className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />
      <h1 className="text-lg font-semibold text-[rgb(var(--foreground))]">{titulo}</h1>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">{texto}</p>
    </div>
  )
}

/**
 * Ficha que a etiqueta do item abre — "de quem é isso, e onde deveria estar?".
 *
 * O gate é levado a sério porque a etiqueta vive colada num objeto que anda
 * pela cidade: uma bandeira esquecida na arquibancada tem o QR à vista de
 * qualquer um. Sem sessão, vínculo e permissão de leitura do acervo, a página
 * não confirma nem que o item existe.
 */
export default async function ItemPatrimonioPage({ searchParams }: Props) {
  const sp = await searchParams
  const bruto = sp.t?.trim()

  if (!bruto) {
    return (
      <Aviso
        titulo="Etiqueta não reconhecida"
        texto="Aponte a câmera para o QR colado no item do acervo."
      />
    )
  }

  const itemId = lerQrItemPatrimonio(extrairPayloadDeQr(bruto))
  if (!itemId) {
    return (
      <Aviso titulo="Etiqueta inválida" texto="Este código não confere com nenhum item do acervo." />
    )
  }

  // `assertAcervoView` redireciona quem não tem permissão; sem sessão, manda
  // para o login preservando o destino.
  let authz: Awaited<ReturnType<typeof assertAcervoView>>
  try {
    authz = await assertAcervoView()
  } catch {
    redirect(`/entrar?callbackUrl=${encodeURIComponent(`/patrimonio/item?t=${bruto}`)}`)
  }

  const item: {
    id: string
    nome: string
    categoria: string
    status: string
    localizacao: string | null
    quantidade: number
  } | null = await db.patrimonioItem.findFirst({
    where: { id: itemId, tenantId: authz.tenant.id },
    select: {
      id: true,
      nome: true,
      categoria: true,
      status: true,
      localizacao: true,
      quantidade: true,
    },
  })

  // Item de outra torcida some como "não encontrado": quem escaneou não precisa
  // saber que ele existe noutro acervo.
  if (!item) {
    return (
      <Aviso
        titulo="Item não encontrado"
        texto="Esta etiqueta não pertence ao acervo desta torcida."
      />
    )
  }

  // Quem só cuida de bandeiras não lê a ficha de um projetor (§5.22).
  try {
    garantirCategoriaPermitida(authz, item.categoria as never)
  } catch {
    return (
      <Aviso
        titulo="Fora do seu acervo"
        texto="Seu acesso cobre apenas o acervo de bandeiras. Este item é gerido pelo Patrimônio."
      />
    )
  }

  const emprestimo: {
    user: { nome: string | null; email: string | null }
    criadoEm: Date
    evento: { titulo: string } | null
  } | null = await db.patrimonioEmprestimo.findFirst({
    where: { itemId: item.id, tenantId: authz.tenant.id, status: 'ABERTO' },
    select: {
      criadoEm: true,
      user: { select: { nome: true, email: true } },
      evento: { select: { titulo: true } },
    },
    orderBy: { criadoEm: 'desc' },
  })

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <Box className="mb-3 h-9 w-9 text-[rgb(var(--color-primary-fg))]" aria-hidden />
        <p className="text-xs font-medium uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
          {CATEGORIA_LABEL[item.categoria] ?? item.categoria}
        </p>
        <h1 className="mt-1 text-lg font-semibold text-[rgb(var(--foreground))]">{item.nome}</h1>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[rgb(var(--foreground-muted))]">Situação</dt>
            <dd className="font-medium text-[rgb(var(--foreground))]">
              {STATUS_LABEL[item.status] ?? item.status}
            </dd>
          </div>
          {item.quantidade > 1 && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Quantidade</dt>
              <dd className="font-medium tabular-nums text-[rgb(var(--foreground))]">
                {item.quantidade}
              </dd>
            </div>
          )}
          {item.localizacao && (
            <div className="flex items-center justify-between gap-3">
              <dt className="inline-flex items-center gap-1.5 text-[rgb(var(--foreground-muted))]">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                Guardado em
              </dt>
              <dd className="text-right font-medium text-[rgb(var(--foreground))]">
                {item.localizacao}
              </dd>
            </div>
          )}
        </dl>

        {emprestimo ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--foreground))]">
              <UserRound className="h-4 w-4" aria-hidden />
              Está com {emprestimo.user.nome?.trim() || emprestimo.user.email || 'um membro'}
            </p>
            {emprestimo.evento && (
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                Saiu para {emprestimo.evento.titulo}
              </p>
            )}
          </div>
        ) : null}

        <Link
          href="/portal/patrimonio"
          className="app-touch-line mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))]"
        >
          Abrir o acervo
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
