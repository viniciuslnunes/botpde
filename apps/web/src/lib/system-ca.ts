/**
 * No Windows (e em redes com TLS inspection / antivírus), o store de CAs
 * empacotado do Node frequentemente não inclui a raiz local — fetch HTTPS
 * (ex.: `/_next/image` → Cloudinary) falha com UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 *
 * Mescla o store do sistema no default do processo. Idempotente e no-op se a
 * API não existir (Node < 22.19) ou se getCACertificates('system') falhar.
 *
 * Tipagem local: `@types/node@20` (e o Node 20 do Railway) ainda não expõem
 * getCACertificates / setDefaultCACertificates em `node:tls`.
 */
type TlsSystemCaApi = {
  getCACertificates?: (type?: string) => readonly string[]
  setDefaultCACertificates?: (certs: readonly string[]) => void
}

export function useSystemCaCertificates(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync bootstrap before any TLS
  const tls = require('node:tls') as TlsSystemCaApi
  const { getCACertificates, setDefaultCACertificates } = tls
  if (
    typeof getCACertificates !== 'function' ||
    typeof setDefaultCACertificates !== 'function'
  ) {
    return
  }

  try {
    const bundled = getCACertificates('default')
    const system = getCACertificates('system')
    if (system.length === 0) return
    setDefaultCACertificates([...new Set([...bundled, ...system])])
  } catch {
    // Ambiente sem store de sistema (ex.: alguns containers) — deixa o default.
  }
}
