import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Recycle } from 'lucide-react'
import { assertStaffBrecho } from '@/lib/brecho-escopo'
import { listarDenunciasBrecho, listarLojasAdminBrecho } from '@/lib/brecho-ticket'
import { BrechoStaffBotoes } from './brecho-staff-botoes'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Brechó — Loja Admin' }

export default async function AdminLojaBrechoPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; denuncia?: string }>
}) {
  let staff: Awaited<ReturnType<typeof assertStaffBrecho>>
  try {
    staff = await assertStaffBrecho()
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const filtro = params.filtro === 'todas' ? 'todas' : 'pendentes'
  const [{ denuncias }, lojas] = await Promise.all([
    listarDenunciasBrecho(staff.raizId, { filtro, skip: 0, take: 50 }),
    listarLojasAdminBrecho(staff.raizId),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold">Brechó da torcida</h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Praça nacional entre sócios. Sem intermediário até alguém declarar má fé — aí a
          equipe de Materiais/Loja (desta unidade ou da Sede) entra na conversa.
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/admin/loja/brecho?filtro=pendentes"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filtro === 'pendentes' ? 'bg-[rgb(var(--primary))] text-white' : 'text-[rgb(var(--foreground-muted))]'}`}
        >
          Denúncias pendentes
        </Link>
        <Link
          href="/admin/loja/brecho?filtro=todas"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filtro === 'todas' ? 'bg-[rgb(var(--primary))] text-white' : 'text-[rgb(var(--foreground-muted))]'}`}
        >
          Todas
        </Link>
      </div>

      {denuncias.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <Recycle className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
          <p className="font-medium">Nenhuma denúncia neste filtro</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[rgb(var(--background-subtle))] text-left text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                <th className="px-4 py-2.5">Alvo</th>
                <th className="px-4 py-2.5">Motivo</th>
                <th className="px-4 py-2.5">Quem</th>
                <th className="px-4 py-2.5">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {denuncias.map((d) => (
                <tr key={d.id} id={params.denuncia === d.id ? 'foco' : undefined}>
                  <td className="px-4 py-3">
                    {d.anuncio?.titulo ?? d.loja?.nome ?? 'Conversa'}
                    <span className="mt-0.5 block font-mono text-[10px] uppercase text-[rgb(var(--foreground-muted))]">
                      {d.status}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-[rgb(var(--foreground-muted))]">{d.motivo}</td>
                  <td className="px-4 py-3">{d.denunciante.nome ?? d.denunciante.nickname}</td>
                  <td className="px-4 py-3">
                    {d.status === 'PENDENTE' ? (
                      <BrechoStaffBotoes
                        denunciaId={d.id}
                        lojaId={d.loja?.id}
                        conversaId={d.interesse?.conversaId}
                      />
                    ) : (
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">
                        {d.atendente?.nome ?? '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide">Lojas dos sócios</h3>
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[rgb(var(--background-subtle))] text-left text-xs uppercase text-[rgb(var(--foreground-muted))]">
                <th className="px-4 py-2.5">Loja</th>
                <th className="px-4 py-2.5">Confiança</th>
                <th className="px-4 py-2.5">Trocas</th>
                <th className="px-4 py-2.5">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lojas.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    {l.nome}
                    {l.congeladaEm ? (
                      <span className="ml-2 font-mono text-[10px] uppercase text-red-500">suspensa</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono">{l.scoreConfianca}</td>
                  <td className="px-4 py-3 font-mono">{l.trocasConcluidas}</td>
                  <td className="px-4 py-3">
                    {staff.podeGerir ? (
                      <BrechoStaffBotoes lojaId={l.id} congelada={Boolean(l.congeladaEm)} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
