import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Completar cadastro' }

/**
 * A ficha mora na aba Cadastro de sócio da carteirinha. Query `secao=cadastro`
 * (o hash `#` some no Location do App Router).
 */
export default function CadastroAssociacaoPage() {
  redirect('/portal/carteirinha?secao=cadastro')
}
