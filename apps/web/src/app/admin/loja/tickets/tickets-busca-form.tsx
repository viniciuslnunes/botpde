'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import type { ArquivoTicketsFiltro } from '@/lib/loja-ticket'
import { PARAM_BUSCA } from '@/lib/listagem'
import { AppButton } from '@/components/ui/button'
import { SearchFilterInput } from '@/components/ui/reactive-search'
import { ListagemForm, useListagemFormNotificarCampo, useListagemFormPendente } from '@/components/admin/ui'

export function TicketsBuscaForm({
  filtro,
  buscaInicial,
  action = '/admin/loja/tickets',
}: {
  filtro: ArquivoTicketsFiltro
  buscaInicial: string
  action?: string
}) {  const pendente = useListagemFormPendente()
  const notificarCampo = useListagemFormNotificarCampo()
  const [valor, setValor] = useState(buscaInicial)
  const [sincronizado, setSincronizado] = useState(buscaInicial)
  if (buscaInicial !== sincronizado) {
    setSincronizado(buscaInicial)
    setValor(buscaInicial)
  }

  function onValorChange(next: string) {
    setValor(next)
    notificarCampo?.(PARAM_BUSCA, next)
  }

  return (
    <ListagemForm
      action={action}
      ariaLabel="Buscar tickets da loja"
      className="flex flex-wrap gap-2"
    >
      <input type="hidden" name="v" value="arquivo" />
      <input type="hidden" name="filtro" value={filtro} />      <SearchFilterInput
        className="min-w-[min(100%,20rem)] flex-1"
        value={valor}
        onChange={onValorChange}
        onClear={() => onValorChange('')}
        placeholder="Buscar cliente, e-mail ou produto…"
        ariaLabel="Buscar tickets"
        name={PARAM_BUSCA}
        loading={pendente}
        exibirDropdown={false}
        size="sm"
      />
      <AppButton variant="primary" icon={Search} type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold">
        Buscar
      </AppButton>
    </ListagemForm>
  )
}
