/**
 * Copy e atalhos dos thin wrappers (áreas que só compõem módulos existentes).
 * Ver docs/data/proposta-departamentos-portal-admin.md § Fase 3.4 / Fase 5 Onda 3.
 * Carnaval virou plugin (barracão) na Onda 4 — copy permanece como fallback de missão.
 */

/** @type {Record<string, { titulo: string, descricao: string, ctaModulo: string }>} */
export const DEPARTAMENTO_THIN_COPY = Object.freeze({
  'social-e-eventos': {
    titulo: 'Social e eventos',
    descricao:
      'Festas e ações na sede — agenda em Eventos, projetos neste cockpit; despesas com rateio no Financeiro.',
    ctaModulo: 'Abrir eventos',
  },
  'materiais-loja': {
    titulo: 'Materiais e loja',
    descricao:
      'Camisas, bandeiras e pedidos: catálogo e sacola na Loja. Gestores acompanham pedidos abertos aqui e no admin.',
    ctaModulo: 'Abrir loja',
  },
  comunicacao: {
    titulo: 'Comunicação',
    descricao:
      'Comunicados oficiais e mural na Comunidade. Moderação de denúncias fica na operação — sem app separado.',
    ctaModulo: 'Abrir comunidade',
  },
  feminino: {
    titulo: 'Feminino',
    descricao:
      'Organização das mulheres na torcida: equipe deste departamento, agenda de ações em Eventos e presença na Comunidade.',
    ctaModulo: 'Abrir comunidade',
  },
  carnaval: {
    titulo: 'Carnaval',
    descricao:
      'Concentração e ensaios de rua em Eventos; checklist do barracão na home do departamento — sem ERP de escola.',
    ctaModulo: 'Abrir eventos',
  },
})

/**
 * @param {string} slug
 * @returns {{ titulo: string, descricao: string, ctaModulo: string } | null}
 */
export function thinCopyPorSlug(slug) {
  return DEPARTAMENTO_THIN_COPY[slug] ?? null
}

/** Slugs thin cujo wrapper mostra próximos eventos. Carnaval = plugin próprio. */
export const THIN_COM_AGENDA = Object.freeze(['social-e-eventos', 'feminino'])
