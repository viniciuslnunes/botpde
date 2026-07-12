import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CreditCard, ArrowRight, CheckCircle2, Clock } from 'lucide-react'
import { CarteirinhaValidadeAlerts } from '@/components/portal/carteirinha-validade-alerts'
import { CarteirinhaReveal } from '@/components/portal/carteirinha-motion'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minha Carteirinha' }

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function isVencida(validade: Date) {
  return validade < new Date()
}

function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export default async function CarteirinhaPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')

  const userId = session.user.id
  const cor = tenant?.corPrimaria ?? '#7c3aed'
  const { r, g, b } = hexToRgb(cor)
  // Cor mais escura para gradiente
  const darken = (v: number) => Math.max(0, Math.floor(v * 0.65))
  const corEscura = `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`
  const textoBranco = luminance(r, g, b) < 180

  const [membro, socio] = await Promise.all([
    tenant
      ? db.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId } },
        })
      : null,
    tenant
      ? db.saasSocio.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId } },
        })
      : null,
  ])

  const nome = session.user.name ?? 'Associado'
  const avatarUrl = session.user.image

  // Sem vínculo com a torcida
  if (!membro) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CreditCard className="mb-4 h-14 w-14 text-[rgb(var(--foreground-muted))]" />
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Sem carteirinha</h1>
        <p className="mt-2 max-w-sm text-sm text-[rgb(var(--foreground-muted))]">
          Você ainda não é membro da torcida. Solicite seu cadastro para receber sua carteirinha digital.
        </p>
      </div>
    )
  }

  // Membro pendente
  if (membro.status === 'PENDENTE') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Clock className="mb-4 h-14 w-14 text-yellow-500" />
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Cadastro em análise</h1>
        <p className="mt-2 max-w-sm text-sm text-[rgb(var(--foreground-muted))]">
          Sua solicitação está sendo avaliada pela administração. Você receberá sua carteirinha após a aprovação.
        </p>
      </div>
    )
  }

  // Torcedor aprovado mas sem número de sócio
  if (membro.status === 'APROVADO' && !socio) {
    return (
      <div className="space-y-6">
        <CarteirinhaReveal index={0}>
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Minha Carteirinha</h1>
        </CarteirinhaReveal>

        <CarteirinhaReveal index={1}>
        <div
          className="relative overflow-hidden rounded-2xl p-6 shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${cor} 0%, ${corEscura} 100%)`,
          }}
        >
          {/* Padrão decorativo */}
          <div
            className="absolute -right-8 -top-8 h-40 w-40 rounded-full opacity-10"
            style={{ background: 'white' }}
          />
          <div
            className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full opacity-10"
            style={{ background: 'white' }}
          />

          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-widest ${textoBranco ? 'text-white/70' : 'text-black/60'}`}>
                {tenant?.nome ?? 'Torcida'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${textoBranco ? 'bg-white/20 text-white' : 'bg-black/20 text-black'}`}>
                TORCEDOR
              </span>
            </div>

            <div className="flex items-center gap-4">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={nome} className="h-16 w-16 rounded-full border-2 border-white/30 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/30 bg-white/20 text-2xl font-bold text-white">
                  {nome.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className={`text-lg font-bold ${textoBranco ? 'text-white' : 'text-black'}`}>{nome}</p>
                <p className={`text-sm ${textoBranco ? 'text-white/70' : 'text-black/60'}`}>Torcedor</p>
              </div>
            </div>
          </div>
        </div>
        </CarteirinhaReveal>

        <CarteirinhaReveal index={2}>
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Você é um torcedor aprovado. Para obter uma carteirinha numerada de sócio, entre em contato com a administração.
          </p>
        </div>
        </CarteirinhaReveal>
      </div>
    )
  }

  if (!socio) return null

  const vencida = isVencida(socio.validade)

  return (
    <div className="space-y-6">
      <CarteirinhaReveal index={0}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Minha Carteirinha</h1>
        {!vencida && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" /> Ativa
          </span>
        )}
      </div>
      </CarteirinhaReveal>

      <CarteirinhaReveal index={1}>
      <div
        className={[
          'relative overflow-hidden rounded-2xl shadow-xl transition-all',
          vencida ? 'opacity-60 grayscale' : '',
        ].join(' ')}
        style={{
          background: `linear-gradient(135deg, ${cor} 0%, ${corEscura} 100%)`,
          aspectRatio: '1.586', // proporção padrão de cartão
        }}
      >
        {/* Círculos decorativos */}
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute right-12 bottom-8 h-20 w-20 rounded-full bg-white/5" />

        <div className="absolute inset-0 flex flex-col justify-between p-6">
          {/* Topo: nome da torcida + tipo */}
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest ${textoBranco ? 'text-white/60' : 'text-black/50'}`}>
                {tenant?.nome ?? 'Torcida'}
              </p>
              <p className={`text-[10px] uppercase tracking-wider ${textoBranco ? 'text-white/40' : 'text-black/40'}`}>
                Carteirinha Digital
              </p>
            </div>
            <div className={`rounded-lg px-2.5 py-1 text-xs font-black uppercase tracking-wider ${textoBranco ? 'bg-white/20 text-white' : 'bg-black/20 text-black'}`}>
              SÓCIO
            </div>
          </div>

          {/* Centro: avatar + nome */}
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={socio.nome}
                className="h-14 w-14 rounded-full border-2 border-white/40 object-cover shadow-md"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 bg-white/20 text-xl font-bold shadow-md" style={{ color: textoBranco ? 'white' : 'black' }}>
                {socio.nome.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className={`text-base font-bold leading-tight ${textoBranco ? 'text-white' : 'text-black'}`}>
                {socio.nome}
              </p>
              <p className={`mt-0.5 font-mono text-xl font-black tracking-wider ${textoBranco ? 'text-white/90' : 'text-black/80'}`}>
                Nº {String(socio.numeroSocio).padStart(5, '0')}
              </p>
            </div>
          </div>

          {/* Base: validade */}
          <div className="flex items-end justify-between">
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${textoBranco ? 'text-white/50' : 'text-black/40'}`}>
                Válido até
              </p>
              <p className={`font-mono text-sm font-bold ${textoBranco ? 'text-white' : 'text-black'}`}>
                {socio.validade.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}
              </p>
            </div>
            {/* Placeholder QR */}
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${textoBranco ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className={`grid grid-cols-3 gap-[2px] ${textoBranco ? 'text-white/60' : 'text-black/50'}`}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className={`h-2.5 w-2.5 rounded-[1px] ${[0,2,4,6,8].includes(i) ? (textoBranco ? 'bg-white/70' : 'bg-black/60') : ''}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </CarteirinhaReveal>

      <CarteirinhaReveal index={2}>
      <CarteirinhaValidadeAlerts validadeIso={socio.validade.toISOString()} />
      </CarteirinhaReveal>

      <CarteirinhaReveal index={3}>
      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] divide-y divide-[rgb(var(--border))]">
        {[
          { label: 'Nome', value: socio.nome },
          { label: 'Número de sócio', value: String(socio.numeroSocio).padStart(5, '0') },
          { label: 'Válido até', value: socio.validade.toLocaleDateString('pt-BR') },
          { label: 'Emitida em', value: socio.criadoEm.toLocaleDateString('pt-BR') },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-[rgb(var(--foreground-muted))]">{item.label}</span>
            <span className="font-mono text-sm font-medium text-[rgb(var(--foreground))]">{item.value}</span>
          </div>
        ))}
      </div>
      </CarteirinhaReveal>

      <CarteirinhaReveal index={4}>
      <Link
        href="/portal"
        className="flex items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
      >
        Voltar ao portal
        <ArrowRight className="h-4 w-4" />
      </Link>
      </CarteirinhaReveal>
    </div>
  )
}
