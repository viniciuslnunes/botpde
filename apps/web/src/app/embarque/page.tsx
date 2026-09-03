import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Bus, QrCode, XCircle } from 'lucide-react'
import { db } from '@torcida/db'
import type { TrechoEmbarque } from '@torcida/db'
import { formatNomeTorcida, TRECHOS_EMBARQUE } from '@torcida/types'
import { auth } from '@/lib/auth'
import { lerQrEmbarque } from '@/lib/embarque-qr'
import { extrairPayloadDeQr } from '@/lib/qr-token'
import { ConfirmarEmbarque } from './confirmar-embarque'

export const metadata: Metadata = { title: 'Embarque na caravana' }

type Props = { searchParams: Promise<{ t?: string }> }

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
 * Tela que a câmera do celular abre ao ler o QR do gestor.
 *
 * A confirmação é um POST atrás de um botão, nunca o próprio carregamento da
 * página: GET não escreve no banco (convenção do repo), e um pré-carregamento
 * de link ou um refresh acidental não podem valer como embarque.
 */
export default async function EmbarquePage({ searchParams }: Props) {
  const sp = await searchParams
  const bruto = sp.t?.trim()

  if (!bruto) {
    return (
      <Aviso
        titulo="QR não reconhecido"
        texto="Aponte a câmera para o código que a organização da caravana está exibindo na tela."
      />
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    redirect(`/entrar?callbackUrl=${encodeURIComponent(`/embarque?t=${bruto}`)}`)
  }

  const payload = extrairPayloadDeQr(bruto)
  const dados = lerQrEmbarque(payload)
  if (!dados) {
    return (
      <Aviso
        titulo="QR inválido"
        texto="Este código não confere. Peça para a organização exibir o QR do embarque de novo."
      />
    )
  }

  const evento: {
    id: string
    titulo: string
    tipo: string
    data: Date
    embarqueTrechoAtivo: TrechoEmbarque | null
    tenant: { nome: string }
  } | null = await db.evento.findUnique({
    where: { id: dados.eventoId },
    select: {
      id: true,
      titulo: true,
      tipo: true,
      data: true,
      embarqueTrechoAtivo: true,
      tenant: { select: { nome: true } },
    },
  })

  if (!evento) {
    return <Aviso titulo="Evento não encontrado" texto="Esta caravana não existe mais." />
  }

  // "Ida para o jogo" só faz sentido em caravana. No ensaio e no evento da
  // sede existe uma perna só, e chamá-la de "ida" confundiria quem escaneou.
  const rotuloTrecho =
    evento.tipo === 'CARAVANA' ? TRECHOS_EMBARQUE[dados.trecho].label : 'Registrar presença'

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 text-center">
        <Bus className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--color-primary-fg))]" />
        <p className="text-xs font-medium uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
          {formatNomeTorcida(evento.tenant.nome)}
        </p>
        <h1 className="mt-1 text-lg font-semibold text-[rgb(var(--foreground))]">
          {evento.titulo}
        </h1>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))]">
          <QrCode className="h-3.5 w-3.5" />
          {rotuloTrecho}
        </p>

        <div className="mt-5">
          <ConfirmarEmbarque payload={payload} eventoId={evento.id} />
        </div>
      </div>
    </div>
  )
}
