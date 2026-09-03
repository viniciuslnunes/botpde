import Link from 'next/link'
import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * Ícone do botão. Aceita `LucideIcon` (o caso normal) **e** componente de
 * ícone escrito à mão — as marcas de terceiros (Discord, Google no `/entrar`)
 * e os ícones próprios do produto não vêm do lucide, e tipar como `LucideIcon`
 * deixava `() => JSX.Element` de fora. Props opcionais porque um ícone local
 * pode ignorá-las.
 */
export type AppButtonIcon = ComponentType<{
  className?: string
  'aria-hidden'?: boolean
}>

/**
 * Botão de ação do produto — UPPERCASE + ícone à esquerda.
 *
 * O padrão tem duas metades e elas moram em lugares diferentes de
 * propósito:
 *
 * - **Caixa alta** é CSS (`.app-btn` em `globals.css`). O rótulo continua
 *   escrito "Salvar alterações" no JSX, então leitor de tela, os testes por
 *   `getByRole('button', { name })` e a busca no código seguem lendo o texto
 *   real. Ver o comentário longo na classe.
 * - **Cor** vem dos tokens do módulo Design (`.btn-primary`, `.btn-danger`,
 *   `.btn-*-soft`…), que o tenant edita em `/admin/design`. Nunca escrever
 *   `bg-[rgb(var(--primary))] text-white` aqui: `text-white` vence o token e
 *   some em identidade branca (Santos, Ceará). Ver docs/data/modulo-design.md.
 *
 * O `icon` é **obrigatório** quando o botão tem rótulo — é o tipo que cobra,
 * não a convenção (ver `PropsComRotulo`). Botão sem rótulo é `iconOnly`, que
 * exige `aria-label` pela mesma razão.
 */

/** Variantes de cor. Todas resolvem por token do módulo Design. */
export type AppButtonVariant =
  | 'primary'
  | 'secondary'
  | 'secondary-soft'
  | 'success'
  | 'success-soft'
  | 'danger'
  | 'danger-soft'
  | 'warning'
  | 'warning-soft'
  | 'info'
  | 'outline'
  | 'ghost'
  /**
   * Ponte de migração: não pinta nada e não impõe tamanho — o visual continua
   * vindo da `className` do call-site. Serve para trazer um botão legado para
   * o padrão (caixa alta + ícone à esquerda) sem repintar a tela no mesmo
   * commit, que é o que torna a migração revisável. Botão NOVO não usa isto:
   * escolha a variante de token, senão a cor escapa do módulo Design.
   */
  | 'none'

export type AppButtonSize = 'sm' | 'md' | 'lg'

const CLASSE_VARIANTE: Record<AppButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  'secondary-soft': 'btn-secondary-soft',
  success: 'btn-success',
  'success-soft': 'btn-success-soft',
  danger: 'btn-danger',
  'danger-soft': 'btn-danger-soft',
  warning: 'btn-warning',
  'warning-soft': 'btn-warning-soft',
  info: 'btn-info',
  outline: 'app-btn-outline',
  ghost: 'app-btn-ghost',
  none: '',
}

const CLASSE_TAMANHO: Record<AppButtonSize, string> = {
  sm: 'app-btn-sm',
  md: 'app-btn-md',
  lg: 'app-btn-lg',
}

type PropsBase = {
  variant?: AppButtonVariant
  size?: AppButtonSize
  /** Troca o ícone por um spinner e desabilita o clique. */
  loading?: boolean
  /** Ocupa a linha inteira (form mobile, rodapé de modal). */
  block?: boolean
  /**
   * Mantém a caixa original do rótulo. Só para texto que vem do banco
   * (nome de sócio, título de post) — caixa alta em nome próprio lê como
   * grito. Não use para escapar do padrão.
   */
  textoOriginal?: boolean
  className?: string
}

/** Botão com rótulo: o ícone é exigido pelo tipo. */
type PropsComRotulo = PropsBase & {
  children: ReactNode
  /** Ícone lucide da ação — Plus para criar, Trash2 para excluir, etc. */
  icon: AppButtonIcon
  /** Ícone à direita, para avanço/afordância (ChevronRight, ExternalLink). */
  iconRight?: AppButtonIcon
  iconOnly?: never
  'aria-label'?: string
}

/** Botão de ícone puro: sem rótulo, então exige `aria-label`. */
type PropsIconeOnly = PropsBase & {
  children?: never
  icon: AppButtonIcon
  iconRight?: never
  iconOnly: true
  'aria-label': string
}

export type AppButtonProps = (PropsComRotulo | PropsIconeOnly) &
  Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children'>

/*
  A uniao acima e o contrato PUBLICO — e ela que cobra o icone de quem tem
  rotulo e o aria-label de quem nao tem. Dentro do componente ela nao serve
  para desestruturar: `PropsComRotulo & PropsIconeOnly` colapsa `children`
  em `never` (um lado declara `ReactNode`, o outro `never`) e o rest deixa
  de ser object type. Este tipo achatado e so a visao interna.
*/
type PropsNormalizadas = PropsBase & {
  children?: ReactNode
  icon: AppButtonIcon
  iconRight?: AppButtonIcon
  iconOnly?: boolean
}

function montarClasses(p: PropsBase & { iconOnly?: boolean }, extra?: string): string {
  // `none` é a ponte de migração: sem cor e SEM tamanho, para não brigar com
  // o `px-3 text-xs` que o call-site legado já declara. Sobra `.app-btn`, que
  // é exatamente o que se quer acrescentar (caixa alta + ritmo do ícone).
  const legado = p.variant === 'none'
  return [
    'app-btn app-action',
    // Utilitario explicito: garante uppercase mesmo se `@layer components`
    // perder na cascata contra classes do call-site. Quem escapa e
    // `textoOriginal` (nome de socio, titulo vindo do banco).
    p.textoOriginal ? 'normal-case tracking-normal' : 'uppercase [letter-spacing:0.04em]',
    legado ? '' : CLASSE_TAMANHO[p.size ?? 'md'],
    CLASSE_VARIANTE[p.variant ?? 'primary'],
    // Ícone puro não tem rótulo para respirar: vira quadrado e perde o
    // padding lateral, senão fica um retângulo largo no meio da toolbar.
    p.iconOnly ? 'w-10 px-0' : '',
    p.block ? 'w-full' : '',
    p.textoOriginal ? 'app-btn-texto-original' : '',
    'disabled:cursor-not-allowed disabled:opacity-60',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary)_/_0.35)]',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function AppButton(props: AppButtonProps) {
  const {
    variant,
    size,
    loading,
    block,
    textoOriginal,
    className,
    icon: Icon,
    iconRight: IconRight,
    iconOnly,
    children,
    disabled,
    ...rest
  } = props as PropsNormalizadas & ComponentPropsWithoutRef<'button'>

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={montarClasses({ variant, size, block, textoOriginal, iconOnly }, className)}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
      {children}
      {IconRight && !loading ? <IconRight aria-hidden /> : null}
    </button>
  )
}

type AppButtonLinkProps = (PropsComRotulo | PropsIconeOnly) &
  Omit<ComponentPropsWithoutRef<typeof Link>, 'className' | 'children'>

/**
 * Mesma aparência para link que age como botão ("Novo evento" que navega).
 * Continua sendo `<a>` — navegação é link, não botão, e o teclado/menu de
 * contexto do navegador dependem disso.
 */
export function AppButtonLink(props: AppButtonLinkProps) {
  const {
    variant,
    size,
    block,
    textoOriginal,
    className,
    icon: Icon,
    iconRight: IconRight,
    iconOnly,
    children,
    loading: _loading,
    ...rest
  } = props as PropsNormalizadas & ComponentPropsWithoutRef<typeof Link>

  return (
    <Link
      {...rest}
      className={montarClasses({ variant, size, block, textoOriginal, iconOnly }, className)}
    >
      <Icon aria-hidden />
      {children}
      {IconRight ? <IconRight aria-hidden /> : null}
    </Link>
  )
}
