/**
 * No Windows (e em redes com TLS inspection / antivírus), o store de CAs
 * empacotado do Node frequentemente não inclui a raiz local — fetch HTTPS
 * (ex.: `/_next/image` → Cloudinary) falha com UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 *
 * Mescla o store do sistema no default do processo. Idempotente e no-op se a
 * API não existir (Node < 22.19) ou se getCACertificates('system') falhar.
 */
export function useSystemCaCertificates(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync bootstrap before any TLS
  const tls = require('node:tls') as typeof import('node:tls')
  if (
    typeof tls.getCACertificates !== 'function' ||
    typeof tls.setDefaultCACertificates !== 'function'
  ) {
    return
  }

  try {
    const bundled = tls.getCACertificates('default')
    const system = tls.getCACertificates('system')
    if (system.length === 0) return
    tls.setDefaultCACertificates([...new Set([...bundled, ...system])])
  } catch {
    // Ambiente sem store de sistema (ex.: alguns containers) — deixa o default.
  }
}
