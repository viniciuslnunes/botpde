import { redirect } from 'next/navigation'

/**
 * Raiz do app — redireciona para a comunidade.
 * O middleware já garante que não-autenticados vão para /entrar.
 */
export default function Home() {
  redirect('/portal/comunidade')
}
