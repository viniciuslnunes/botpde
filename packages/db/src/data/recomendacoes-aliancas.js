/**
 * Recomendações de aliança curadas a partir de docs/knowledge/aliancas.md.
 * Fonte de verdade do produto para seed — o markdown continua no agente.
 *
 * Regra: rivais nunca entram aqui. BAIXA/MEDIA são informativas;
 * só ALTA vira CTA de proposta automática quando o tenant sugerido existir.
 */

/** @typedef {'ALTA' | 'MEDIA' | 'BAIXA'} ConfiancaRecomendacaoSeed */

/**
 * @typedef {object} RecomendacaoAliancaSeed
 * @property {string} tenantSlug — torcida que recebe a recomendação
 * @property {string} nomeSugerido — nome canônico (ex.: Remoçada)
 * @property {string[]} [slugsSugeridos] — slugs possíveis do tenant aliado no SaaS
 * @property {string[]} [nomesAlternativos] — nomes para match case-insensitive
 * @property {ConfiancaRecomendacaoSeed} confianca
 * @property {string} fonte
 * @property {string} [observacao]
 */

/** @type {RecomendacaoAliancaSeed[]} */
export const RECOMENDACOES_ALIANCAS = [
  {
    tenantSlug: 'pde-gavioes-fiel',
    nomeSugerido: 'Remoçada',
    slugsSugeridos: [
      'remocada',
      'camisa-33-remo',
      'camisa-33',
      'torcida-organizada-remista-pa',
      'torcida-organizada-remista',
    ],
    nomesAlternativos: [
      'Remoçada',
      'Torcida Organizada Remista',
      'Camisa 33',
      'Remocada',
    ],
    confianca: 'ALTA',
    fonte:
      'Lance — Como se formam as alianças entre torcidas organizadas (consulta 2026-07-06); docs/knowledge/aliancas.md',
    observacao:
      'Aliança histórica amplamente citada. Única sugestão automática para Gaviões (independente dos blocos nacionais).',
  },
  {
    tenantSlug: 'pde-gavioes-fiel',
    nomeSugerido: 'Fúria Jovem do Botafogo',
    slugsSugeridos: ['furia-jovem-botafogo', 'furia-jovem-do-botafogo', 'furia-jovem-botafogo-rj'],
    nomesAlternativos: ['Fúria Jovem do Botafogo', 'Furia Jovem do Botafogo'],
    confianca: 'MEDIA',
    fonte: 'Redes sociais (TikTok/YouTube) — docs/knowledge/aliancas.md (consulta 2026-07-06)',
    observacao:
      'Citada apenas em redes sociais, sem confirmação jornalística sólida. Requer confirmação do Presidente — não é sugestão automática.',
  },
  {
    tenantSlug: 'pde-gavioes-fiel',
    nomeSugerido: 'Gaviões Alvinegros',
    slugsSugeridos: ['gavioes-alvinegros', 'gavioes-alvinegros-figueirense'],
    nomesAlternativos: ['Gaviões Alvinegros', 'Gavioes Alvinegros'],
    confianca: 'BAIXA',
    fonte: 'Redes sociais (TikTok) — docs/knowledge/aliancas.md (consulta 2026-07-06)',
    observacao:
      'Citada apenas em redes sociais; sem fonte jornalística. Não deve ser sugerida sem confirmação do Presidente.',
  },
]
