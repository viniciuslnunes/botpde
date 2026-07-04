import { defineConfig } from 'tsup'

/**
 * Build de distribuição do design system (dist/) — não é o caminho que
 * apps/web usa hoje (Next.js transpila o pacote direto do ./src, via
 * "exports" em package.json). Este build existe para consumo externo do
 * pacote (ex: sync com claude.ai/design), mantendo o dev flow atual intacto.
 */
export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
})
