import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Crown } from 'lucide-react'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { carregarLiderancas } from '@/lib/liderancas-console'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import {
  ListagemPaginacao,
  ListagemToolbar,
  ListagemVazia,
} from '@/components/admin/ui/listagem'
import { parseListagemParams, type ListagemSpec } from '@/lib/listagem'
import { LISTAGEM_SUPER_ADMIN_LIDERANCAS } from '@/lib/listagem/specs'
import { resumirPaginacao } from '@/lib/listagem/query'
import { LiderancasConsole } from './liderancas-console'
import { LiderancasBuscaInteligente } from './liderancas-busca'

export const metadata: Metadata = { title: 'Lideranças — Super Admin' }

const SPEC = LISTAGEM_SUPER_ADMIN_LIDERANCAS

/** Toolbar só com filtros — a busca inteligente vive fora (typeahead). */
const SPEC_FILTROS: ListagemSpec = { ...SPEC, buscaEm: undefined }

function primeiro(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? ''
  return valor ?? ''
}

export default async function LiderancasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session?.user?.id || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const params = await searchParams
  const listagem = parseListagemParams(params, SPEC)
  const raizId = primeiro(params.raiz).trim() || null

  const { grupos, total, resumo } = await carregarLiderancas(session.user.id, listagem, {
    raizId,
  })
  const paginacao = resumirPaginacao(total, listagem)

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Lideranças"
        description="Presidência de cada torcida e liderança de cada unidade. Troca de gestão acontece a cada 3–4 anos — aqui a plataforma corrige, transfere ou zera quem lidera o quê."
        icon={<Crown className="h-5 w-5" />}
      />

      <div className="app-container min-w-0 flex-1 space-y-4 py-5 sm:py-8">
        <div className="flex flex-wrap items-start gap-3">
          <LiderancasBuscaInteligente spec={SPEC} params={listagem} raizId={raizId} />
          <div className="min-w-0 flex-1">
            <ListagemToolbar
              spec={SPEC_FILTROS}
              params={listagem}
              paginacao={paginacao}
              escopoChave="plataforma"
              filtrosCompactos={[{ filtroId: 'escopo' }]}
              extras={{ raiz: raizId ?? undefined }}
            />
          </div>
        </div>

        {grupos.length === 0 ? (
          <ListagemVazia
            spec={SPEC}
            params={listagem}
            vazio={{
              icon: <Crown className="h-10 w-10" aria-hidden />,
              title: 'Nenhuma torcida neste recorte',
              description:
                'Ajuste a busca ou o filtro de escopo. O autocomplete sugere torcida, unidade ou e-mail de quem lidera.',
            }}
          />
        ) : (
          <>
            <LiderancasConsole grupos={grupos} resumo={resumo} />
            {!raizId && (
              <ListagemPaginacao spec={SPEC} params={listagem} paginacao={paginacao} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
