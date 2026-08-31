'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { AccessUserPanel } from '@/components/admin/access-user-panel'
import { carregarAcessoMembro, concederFonteVerificadaAction, type MembroAcessoDados } from './acesso-actions'
import { toast } from '@torcida/ui'

/**
 * Aba "Acessos" do card de detalhes — cargo, área e permissões adicionais da
 * pessoa cujo cadastro está aberto.
 *
 * Carrega sob demanda: cargos, áreas e vínculos da torcida inteira só entram no
 * ar quando a aba é aberta, para o card não pagar essas quatro consultas em
 * toda linha clicada.
 */
export function TabAcesso({ membroId }: { membroId: string }) {
  const [dados, setDados] = useState<MembroAcessoDados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  // Trocar de membro (ou pedir recarga) volta ao estado de carregando já no
  // render — em effect a aba mostrava por um frame os dados do membro anterior.
  const alvo = `${membroId}|${versao}`
  const [alvoSincronizado, setAlvoSincronizado] = useState(alvo)
  if (alvo !== alvoSincronizado) {
    setAlvoSincronizado(alvo)
    setDados(null)
    setErro(null)
  }

  useEffect(() => {
    let ativo = true
    carregarAcessoMembro(membroId)
      .then((r) => {
        if (!ativo) return
        if (r.ok) setDados(r.dados)
        else setErro(r.error)
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível carregar o acesso.')
      })
    return () => {
      ativo = false
    }
  }, [membroId, versao])

  // Salvar/cancelar não fecha o card: recarrega o painel com o estado novo, e o
  // que mudou já aparece na aba Histórico ao lado.
  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  if (erro) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center">
        <KeyRound className="mx-auto h-8 w-8 text-[rgb(var(--foreground-muted))]" />
        <p className="mt-2 text-sm font-medium text-[rgb(var(--foreground))]">{erro}</p>
        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
          Alterar cargo, área ou permissão exige a permissão de gerenciar acessos.
        </p>
      </div>
    )
  }

  if (!dados) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[rgb(var(--foreground-muted))]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando acesso…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Cargo, área e permissões adicionais desta pessoa nesta torcida. Toda alteração
        fica registrada na aba <strong className="font-medium">Histórico</strong>.
      </p>
      <AccessUserPanel
        key={`${dados.usuario.id}-${versao}`}
        variant="embutido"
        usuario={dados.usuario}
        roles={dados.roles}
        departamentos={dados.departamentos}
        tipoSede={dados.tipoSede}
        ownerOcupadoPor={dados.ownerOcupadoPor}
        onClose={recarregar}
      />
      <FonteVerificadaToggle
        membroId={membroId}
        concedida={Boolean(dados.fonteVerificadaEm)}
        onDone={recarregar}
      />
    </div>
  )
}

function FonteVerificadaToggle({
  membroId,
  concedida,
  onDone,
}: {
  membroId: string
  concedida: boolean
  onDone: () => void
}) {
  const [pending, start] = useTransition()

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-3">
      <p className="text-sm font-medium text-[rgb(var(--foreground))]">Fonte verificada</p>
      <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
        Selo de perfil autêntico nesta torcida. Artigo sai como opinião verificada, não como
        comunicado oficial. Não concede cargo.
      </p>
      <button
        type="button"
        disabled={pending}
        className="app-action mt-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-xs font-medium text-[rgb(var(--foreground))] disabled:opacity-50"
        onClick={() => {
          start(async () => {
            const r = await concederFonteVerificadaAction(membroId, !concedida)
            if ('error' in r) {
              toast.error(r.error)
              return
            }
            onDone()
          })
        }}
      >
        {concedida ? 'Revogar selo' : 'Conceder selo'}
      </button>
    </div>
  )
}

