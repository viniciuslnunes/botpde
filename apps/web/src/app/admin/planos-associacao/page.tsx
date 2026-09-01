import { permanentRedirect } from 'next/navigation'

/** Planos de sócio virou etapa de `/admin/financeiro`; rota antiga redireciona. */
export default async function PlanosAssociacaoLegadoPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const { edit } = await searchParams
  permanentRedirect(
    edit
      ? `/admin/financeiro/planos/novo?edit=${encodeURIComponent(edit)}`
      : '/admin/financeiro/planos',
  )
}
