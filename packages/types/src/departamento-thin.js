/**
 * Copy e atalhos dos thin wrappers (áreas que só compõem módulos existentes).
 * Ver docs/data/proposta-departamentos-portal-admin.md § Fase 3.4.
 */

/** @type {Record<string, { titulo: string, descricao: string, ctaModulo: string }>} */
export const DEPARTAMENTO_THIN_COPY = Object.freeze({
  'social-e-eventos': {
    titulo: 'Social e eventos',
    descricao:
      'Agenda da torcida no portal de Eventos. Gestores criam e acompanham RSVPs; a equipe organiza a festa.',
    ctaModulo: 'Abrir eventos',
  },
  'materiais-loja': {
    titulo: 'Materiais e loja',
    descricao:
      'Catálogo, sacola e pedidos ficam na Loja do portal. Gestores operam pedidos e estoque no admin.',
    ctaModulo: 'Abrir loja',
  },
  comunicacao: {
    titulo: 'Comunicação',
    descricao:
      'Mural, posts e conversa da torcida na Comunidade. Curadoria e moderação pesada ficam na operação admin.',
    ctaModulo: 'Abrir comunidade',
  },
  feminino: {
    titulo: 'Feminino',
    descricao:
      'Espaço da organização das mulheres: equipe desta área e presença na Comunidade. Sem app separado — compõe o que já existe.',
    ctaModulo: 'Abrir comunidade',
  },
  carnaval: {
    titulo: 'Carnaval',
    descricao:
      'Ensaios de rua, concentração e cronograma usam Eventos. A equipe do departamento organiza; a operação completa fica no admin de eventos.',
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

/** Slugs cujo thin wrapper mostra próximos eventos (compor agenda). */
export const THIN_COM_AGENDA = Object.freeze(['social-e-eventos', 'carnaval'])
