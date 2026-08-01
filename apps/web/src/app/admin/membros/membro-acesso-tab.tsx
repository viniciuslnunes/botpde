'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { AccessUserPanel } from '@/components/admin/access-user-panel'
import { carregarAcessoMembro, type MembroAcessoDados } from './acesso-actions'

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

  useEffect(() => {
    let ativo = true
    setDados(null)
    setErro(null)
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
        onClose={recarregar}
      />
    </div>
  )
}
