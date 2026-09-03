import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { db } from '@torcida/db'
import { carregarFrotaCaravana } from '@/lib/caravana-frota'

export const metadata: Metadata = { title: 'Manifesto de embarque' }

/**
 * Manifesto de embarque — a lista nominal por veículo, para imprimir.
 *
 * É o documento que a empresa de fretamento pede e a folha que fica com o
 * responsável de cada ônibus. Também é a prova de organização da torcida:
 * pela LGE (art. 178 §§ 5º e 6º) ela responde pelo que o associado faz no
 * trajeto de ida e volta, e "quem estava em qual ônibus" deixa de ser memória
 * de grupo de WhatsApp.
 *
 * Página de leitura, sem JS: nasce pronta para o Ctrl+P. Traz só o que o
 * documento exige — nome e contato —, nunca a ficha inteira do associado.
 */
export default async function ManifestoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let tenantId: string
  try {
    const authz = await assertPermission(PERMISSIONS.EVENTS_MANAGE)
    tenantId = authz.tenant.id
  } catch {
    redirect('/admin')
  }

  type EventoRow = {
    id: string
    titulo: string
    data: Date
    local: string | null
    tipo: string
    partida: { adversario: string; local: string | null } | null
  }
  const evento: EventoRow | null = (await db.evento.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      titulo: true,
      data: true,
      local: true,
      tipo: true,
      partida: { select: { adversario: true, local: true } },
    },
  })) as EventoRow | null
  if (!evento) notFound()

  const frota = await carregarFrotaCaravana(tenantId, evento.id, { dataEvento: evento.data })
  const semLugar = frota.passageiros.filter((p) => !p.veiculoId)

  const dataLabel = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(evento.data))

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 text-[rgb(var(--foreground))] print:p-0">
      <header className="border-b border-[rgb(var(--border))] pb-4">
        <h1 className="text-xl font-semibold">Manifesto de embarque</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          {evento.titulo}
          {evento.partida ? ` · ${evento.partida.adversario}` : ''}
        </p>
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          {dataLabel}
          {evento.local ? ` · ${evento.local}` : ''}
        </p>
        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
          {frota.resumo.alocados} passageiro(s) alocado(s) em {frota.veiculos.length} veículo(s)
          {semLugar.length > 0 ? ` · ${semLugar.length} sem ônibus` : ''}
        </p>
      </header>

      {frota.veiculos.length === 0 && (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum veículo cadastrado nesta caravana.
        </p>
      )}

      {frota.veiculos.map((veiculo) => {
        const passageiros = frota.passageiros.filter((p) => p.veiculoId === veiculo.id)
        return (
          <section key={veiculo.id} className="break-inside-avoid space-y-2">
            <div className="border-b border-[rgb(var(--border))] pb-1">
              <h2 className="text-base font-semibold">{veiculo.identificacao}</h2>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                {[
                  `${passageiros.length}/${veiculo.capacidade} lugares`,
                  veiculo.empresa,
                  veiculo.placa,
                  veiculo.pontoEmbarque,
                  veiculo.responsavelNome ? `Responsável: ${veiculo.responsavelNome}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            {passageiros.length === 0 ? (
              <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem passageiros.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--border))] text-left text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    <th className="w-10 py-1.5 font-medium">#</th>
                    <th className="py-1.5 font-medium">Nome</th>
                    <th className="py-1.5 font-medium">Contato</th>
                    <th className="w-24 py-1.5 font-medium">Embarque</th>
                  </tr>
                </thead>
                <tbody>
                  {passageiros.map((p, i) => (
                    <tr key={p.userId} className="border-b border-[rgb(var(--border)_/_0.5)]">
                      <td className="py-1.5 tabular-nums text-[rgb(var(--foreground-muted))]">
                        {i + 1}
                      </td>
                      <td className="py-1.5">{p.nome}</td>
                      <td className="py-1.5 text-[rgb(var(--foreground-muted))]">
                        {p.telefone ?? '—'}
                      </td>
                      <td className="py-1.5 text-[rgb(var(--foreground-muted))]">
                        {p.checkedInAt ? 'Embarcou' : '☐'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )
      })}

      {semLugar.length > 0 && (
        <section className="break-inside-avoid space-y-2">
          <h2 className="border-b border-[rgb(var(--border))] pb-1 text-base font-semibold">
            Sem ônibus definido
          </h2>
          <ul className="text-sm">
            {semLugar.map((p) => (
              <li key={p.userId} className="border-b border-[rgb(var(--border)_/_0.5)] py-1.5">
                {p.nome}
                {p.telefone ? ` · ${p.telefone}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="pt-4 text-xs text-[rgb(var(--foreground-muted))]">
        Documento gerado pelo sistema da torcida. Contém dados pessoais dos associados —
        use apenas para a operação desta viagem.
      </footer>
    </div>
  )
}
