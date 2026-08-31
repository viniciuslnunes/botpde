import Link from 'next/link'
import { Pencil, ShieldCheck, UserRound, Users2 } from 'lucide-react'
import { rotuloCargoSistema } from '@torcida/types'
import {
  ListagemPaginacao,
  ListagemTh,
  ListagemToolbar,
  ListagemVazia,
  TableShell,
} from '@/components/admin/ui'
import {
  construirHrefListagem,
  type ListagemFacetas,
  type ListagemPaginacao as ListagemPaginacaoResumo,
  type ListagemParams,
  type ListagemSpec,
} from '@/lib/listagem'
import type { OpcoesDinamicas } from '@/lib/listagem/ui'

export interface AccessPessoaPerfil {
  id: string
  nome: string
  cor: string
  isSystem: boolean
}

export interface AccessPessoaArea {
  id: string
  nome: string
  cor: string
  gestor: boolean
}

export interface AccessPessoaRow {
  id: string
  nome: string | null
  email: string | null
  avatarUrl: string | null
  perfis: AccessPessoaPerfil[]
  areas: AccessPessoaArea[]
  /** Permissões concedidas fora do que os perfis já cobrem — contada no servidor. */
  extras: number
}

export interface AccessPessoasListaProps {
  spec: ListagemSpec
  params: ListagemParams
  paginacao: ListagemPaginacaoResumo
  pessoas: AccessPessoaRow[]
  facetas: ListagemFacetas
  dinamicas: OpcoesDinamicas
  tipoSede: string
  tenantId: string
  /** Params fora do contrato a preservar (`secao=pessoas`). */
  extras: Record<string, string | undefined>
}

/**
 * Listagem paginada de pessoas do Controle de acesso.
 *
 * Server component de ponta a ponta: a linha não hidrata nada, e abrir o painel
 * de alguém é um `Link` para `?usuario=` — a página resolve aquele usuário
 * sozinho, sem carregar a torcida inteira para editar uma pessoa.
 */
export function AccessPessoasLista({
  spec,
  params,
  paginacao,
  pessoas,
  facetas,
  dinamicas,
  tipoSede,
  tenantId,
  extras,
}: AccessPessoasListaProps) {
  function hrefEditar(userId: string): string {
    return construirHrefListagem(spec, params, {
      extras: { ...extras, usuario: userId },
    })
  }

  return (
    <div className="space-y-3">
      <ListagemToolbar
        spec={spec}
        params={params}
        paginacao={paginacao}
        facetas={facetas}
        dinamicas={dinamicas}
        extras={extras}
        escopoChave={tenantId}
      />

      {pessoas.length === 0 ? (
        <ListagemVazia
          spec={spec}
          params={params}
          vazio={{
            icon: <UserRound className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" aria-hidden />,
            title: 'Nenhum usuário nesta torcida ainda',
            description: (
              <>
                Defina cargos e áreas primeiro; depois atribua perfis às pessoas —
                a área de atuação vem junto com o perfil.
              </>
            ),
          }}
        />
      ) : (
        <TableShell
          isEmpty={false}
          empty={{ title: 'Nenhum usuário' }}
          footer={
            <ListagemPaginacao
              spec={spec}
              params={params}
              paginacao={paginacao}
              extras={extras}
            />
          }
        >
          <thead className="border-b border-[rgb(var(--border))]">
            <tr>
              {spec.colunas.map((coluna) => (
                <ListagemTh
                  key={coluna.id}
                  spec={spec}
                  params={params}
                  coluna={coluna}
                  facetas={facetas}
                  dinamicas={dinamicas}
                  extras={extras}
                />
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((pessoa) => {
              const nome = pessoa.nome ?? pessoa.email ?? 'Usuário sem nome'
              return (
                <tr
                  key={pessoa.id}
                  className="border-b border-[rgb(var(--border)_/_0.5)] last:border-0 transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.6)]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {pessoa.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- avatar de OAuth: host varia por provedor e não está todo em `images.remotePatterns`
                        <img
                          src={pessoa.avatarUrl}
                          alt=""
                          width={36}
                          height={36}
                          loading="lazy"
                          decoding="async"
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]">
                          <UserRound className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                      <Link
                        href={hrefEditar(pessoa.id)}
                        className="min-w-0 font-medium text-[rgb(var(--foreground))] hover:underline"
                      >
                        {nome}
                      </Link>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-[rgb(var(--foreground-muted))]">
                    <span className="block max-w-[16rem] truncate">
                      {pessoa.email ?? '—'}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {pessoa.perfis.length === 0 ? (
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">
                        Sem perfil
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {pessoa.perfis.map((perfil) => (
                          <span
                            key={perfil.id}
                            className="flex items-center gap-1 rounded-full border border-[rgb(var(--border))] px-2 py-0.5 text-xs text-[rgb(var(--foreground))]"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: perfil.cor }}
                              aria-hidden
                            />
                            {perfil.isSystem
                              ? rotuloCargoSistema(perfil.nome, tipoSede)
                              : perfil.nome}
                          </span>
                        ))}
                        {pessoa.extras > 0 && (
                          <span className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--color-primary-fg))]">
                            +{pessoa.extras} extra{pessoa.extras === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {pessoa.areas.length === 0 ? (
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">—</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {pessoa.areas.map((area) => (
                          <span
                            key={area.id}
                            className="flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: area.cor }}
                              aria-hidden
                            />
                            {area.nome}
                            {area.gestor ? (
                              <ShieldCheck
                                className="h-3 w-3 text-[rgb(var(--color-primary-fg))]"
                                aria-label="gestor da área"
                              />
                            ) : (
                              <Users2 className="h-3 w-3 opacity-60" aria-label="membro da área" />
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Link
                      href={hrefEditar(pessoa.id)}
                      title={`Editar acesso de ${nome}`}
                      className="app-touch-target inline-flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">Editar acesso de {nome}</span>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}
