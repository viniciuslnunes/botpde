import { redirect } from 'next/navigation'

/**
 * Raiz do app — redireciona para o portal.
 * O middleware já garante que não-autenticados vão para /entrar.
 */
export default function Home() {
  redirect('/portal')
}
