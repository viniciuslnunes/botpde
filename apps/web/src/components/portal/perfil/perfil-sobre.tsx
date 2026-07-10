import Link from 'next/link'
import { MapPin, Building2, Calendar, Mail, CreditCard } from 'lucide-react'
import { PerfilForm } from '@/components/portal/perfil-form'

interface PerfilSobreProps {
  isSelf: boolean
  bio: string | null
  exibirCidade: boolean
  exibirSede: boolean
  exibirDesde: boolean
  cidade: string | null
  sedeNome: string | null
  membroDesde: Date | null
  email: string | null
  tipoMembro: string | null
  numeroSocio: string | null
  validadeSocio: Date | null
  membroForm: {
    nome: string
    idade?: number | null
    telefone?: string | null
    cidade?: string | null
    discordTag?: string | null
    temMembro: boolean
  }
}

export function PerfilSobre({
  isSelf,
  bio,
  exibirCidade,
  exibirSede,
  exibirDesde,
  cidade,
  sedeNome,
  membroDesde,
  email,
  tipoMembro,
  numeroSocio,
  validadeSocio,
  membroForm,
}: PerfilSobreProps) {
  return (
    <div className="space-y-4">
      {bio && (
        <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Bio
          </h3>
          <p className="whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">{bio}</p>
        </section>
      )}

      <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Torcida
        </h3>
        <ul className="space-y-2 text-sm text-[rgb(var(--foreground))]">
          {tipoMembro && (
            <li className="flex items-center gap-2">
              <span className="text-[rgb(var(--foreground-muted))]">Tipo:</span>
              {tipoMembro === 'SOCIO' ? 'Sócio' : 'Torcedor'}
            </li>
          )}
          {exibirCidade && cidade && (
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              {cidade}
            </li>
          )}
          {exibirSede && sedeNome && (
            <li className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              {sedeNome}
            </li>
          )}
          {exibirDesde && membroDesde && (
            <li className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              Membro desde{' '}
              {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(membroDesde)}
            </li>
          )}
        </ul>
      </section>

      {isSelf && email && (
        <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Conta
          </h3>
          <p className="flex items-center gap-2 text-sm text-[rgb(var(--foreground))]">
            <Mail className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            {email}
          </p>
        </section>
      )}

      {isSelf && numeroSocio && validadeSocio && (
        <section className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-violet-500" />
            <div>
              <p className="text-sm font-semibold">Carteirinha Nº {numeroSocio}</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Válida até {new Intl.DateTimeFormat('pt-BR').format(validadeSocio)}
              </p>
            </div>
          </div>
          <Link
            href="/portal/carteirinha"
            className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
          >
            Ver →
          </Link>
        </section>
      )}

      {isSelf && (
        <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[rgb(var(--foreground))]">Dados pessoais</h3>
          <PerfilForm {...membroForm} />
        </section>
      )}
    </div>
  )
}
