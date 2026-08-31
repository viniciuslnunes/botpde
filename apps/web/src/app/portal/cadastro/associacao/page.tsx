import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Completar cadastro' }

/**
 * A ficha mora na carteirinha. Query `secao=cadastro` sobrevive ao redirect
 * (o hash `#` some no Location do App Router).
 */
export default function CadastroAssociacaoPage() {
  redirect('/portal/carteirinha?secao=cadastro')
}
