/**
 * Torcidas organizadas principais por clube — extraídas de
 * `docs/knowledge/diretorio-nacional.md` (negrito + irmãs listadas na mesma
 * linha do clube). Slugs alinhados ao tenant em homolog quando já existia.
 *
 * Cada entrada vira um Tenant na plataforma (sem owner — transferência futura).
 * `clube` + `estado` casam com `Afiliacao` no seed via nome/UF.
 *
 * Não inclui: unidades Caso B (PDE FIEL BAIXADA), subsedes como tenant, nem
 * as ~500 conhecidas só de scraper — isso é `seed:torcidas-tenants` completo.
 *
 * @typedef {{ slug: string, nome: string, clube: string, estado: string, corPrimaria?: string, cidade?: string, sedeId?: string }} TorcidaCurada
 */

/** @type {TorcidaCurada[]} */
export const TORCIDAS_BRASIL = [
  // ── São Paulo ─────────────────────────────────────────────────────────────
  { slug: 'pde-gavioes-fiel', nome: 'Gaviões da Fiel', clube: 'Corinthians', estado: 'SP', corPrimaria: '#1a1a1a', cidade: 'São Paulo', sedeId: 'sede-principal-pde' },
  { slug: 'camisa-12-corinthians', nome: 'Camisa 12', clube: 'Corinthians', estado: 'SP', corPrimaria: '#111111', cidade: 'São Paulo' },
  { slug: 'pavilhao-nove', nome: 'Pavilhão Nove', clube: 'Corinthians', estado: 'SP', corPrimaria: '#2d2d2d', cidade: 'São Paulo' },
  { slug: 'estopim-da-fiel-sp', nome: 'Estopim da Fiel', clube: 'Corinthians', estado: 'SP', corPrimaria: '#1a1a1a', cidade: 'Diadema' },
  { slug: 'torcida-organizada-coringao-chopp-sp', nome: 'Coringão Chopp', clube: 'Corinthians', estado: 'SP', corPrimaria: '#111111', cidade: 'São Bernardo do Campo' },
  { slug: 'torcida-fiel-macabra-sp', nome: 'Fiel Macabra', clube: 'Corinthians', estado: 'SP', corPrimaria: '#2d2d2d', cidade: 'Bauru' },

  { slug: 'mancha-alviverde', nome: 'Mancha Alviverde', clube: 'Palmeiras', estado: 'SP', corPrimaria: '#006437', cidade: 'São Paulo' },
  { slug: 'tup-palmeiras', nome: 'TUP — Torcida Uniformizada do Palmeiras', clube: 'Palmeiras', estado: 'SP', corPrimaria: '#006437', cidade: 'São Paulo' },
  { slug: 'torcida-academicos-da-savoia-sp', nome: 'Acadêmicos da Savóia', clube: 'Palmeiras', estado: 'SP', corPrimaria: '#006437', cidade: 'São Paulo' },
  { slug: 'torcida-pork-s-alviverde-sp', nome: "Pork's Alviverde", clube: 'Palmeiras', estado: 'SP', corPrimaria: '#006437', cidade: 'São Paulo' },
  { slug: 'torcida-organizada-rasta-alvi-verde-sp', nome: 'Rasta Alviverde', clube: 'Palmeiras', estado: 'SP', corPrimaria: '#006437', cidade: 'São Paulo' },

  { slug: 'tti-sao-paulo', nome: 'Torcida Tricolor Independente', clube: 'São Paulo FC', estado: 'SP', corPrimaria: '#E4002B', cidade: 'São Paulo' },
  { slug: 'dragoes-da-real', nome: 'Dragões da Real', clube: 'São Paulo FC', estado: 'SP', corPrimaria: '#C8102E', cidade: 'São Paulo' },
  { slug: 'torcida-falange-tricolor-sp', nome: 'Falange Tricolor', clube: 'São Paulo FC', estado: 'SP', corPrimaria: '#E4002B', cidade: 'São Paulo' },
  { slug: 'metal-tricolor-sp', nome: 'Metal Tricolor', clube: 'São Paulo FC', estado: 'SP', corPrimaria: '#E4002B', cidade: 'São Paulo' },
  { slug: 'torcida-os-implacaveis-sp', nome: 'Os Implacáveis', clube: 'São Paulo FC', estado: 'SP', corPrimaria: '#E4002B', cidade: 'São Paulo' },
  { slug: 'torcida-organizada-tricolor-chopp-sp', nome: 'Tricolor Chopp', clube: 'São Paulo FC', estado: 'SP', corPrimaria: '#E4002B', cidade: 'São Paulo' },

  { slug: 'torcida-jovem-santos', nome: 'Torcida Jovem do Santos', clube: 'Santos', estado: 'SP', corPrimaria: '#FFFFFF', cidade: 'Santos' },
  { slug: 'sangue-jovem-santos-sp', nome: 'Sangue Jovem', clube: 'Santos', estado: 'SP', corPrimaria: '#FFFFFF', cidade: 'Santos' },
  { slug: 'forca-jovem-do-santos-sp', nome: 'Força Jovem do Santos', clube: 'Santos', estado: 'SP', corPrimaria: '#FFFFFF', cidade: 'Santos' },

  { slug: 'furia-independente-guarani', nome: 'Fúria Independente', clube: 'Guarani', estado: 'SP', corPrimaria: '#006B3F', cidade: 'Campinas' },
  { slug: 'guerreiros-da-tribo-torcida-organizada-sp', nome: 'Guerreiros da Tribo', clube: 'Guarani', estado: 'SP', corPrimaria: '#006B3F', cidade: 'Campinas' },
  { slug: 'torcida-jovem-guarani-sp', nome: 'Torcida Jovem Guarani', clube: 'Guarani', estado: 'SP', corPrimaria: '#006B3F', cidade: 'Campinas' },

  { slug: 'raca-tricolor-paulista', nome: 'Raça Tricolor', clube: 'Paulista', estado: 'SP', corPrimaria: '#E31E24', cidade: 'Jundiaí' },
  { slug: 'gamor-forca-jovem-sp', nome: 'Gamor Força Jovem', clube: 'Paulista', estado: 'SP', corPrimaria: '#E31E24', cidade: 'Jundiaí' },

  // ── Rio de Janeiro ────────────────────────────────────────────────────────
  { slug: 'torcida-jovem-flamengo', nome: 'Torcida Jovem do Flamengo', clube: 'Flamengo', estado: 'RJ', corPrimaria: '#C8102E', cidade: 'Rio de Janeiro' },
  { slug: 'raca-rubro-negra', nome: 'Raça Rubro-Negra', clube: 'Flamengo', estado: 'RJ', corPrimaria: '#C8102E', cidade: 'Rio de Janeiro' },
  { slug: 'forca-jovem-vasco', nome: 'Força Jovem do Vasco', clube: 'Vasco', estado: 'RJ', corPrimaria: '#000000', cidade: 'Rio de Janeiro' },
  { slug: 'young-flu', nome: 'Young Flu', clube: 'Fluminense', estado: 'RJ', corPrimaria: '#7B0044', cidade: 'Rio de Janeiro' },
  { slug: 'forca-flu', nome: 'Força Flu', clube: 'Fluminense', estado: 'RJ', corPrimaria: '#7B0044', cidade: 'Rio de Janeiro' },
  { slug: 'furia-jovem-botafogo', nome: 'Fúria Jovem do Botafogo', clube: 'Botafogo', estado: 'RJ', corPrimaria: '#000000', cidade: 'Rio de Janeiro' },

  // ── Minas Gerais ──────────────────────────────────────────────────────────
  { slug: 'galoucura', nome: 'Galoucura', clube: 'Atlético-MG', estado: 'MG', corPrimaria: '#000000', cidade: 'Belo Horizonte' },
  { slug: 'mafia-azul', nome: 'Máfia Azul', clube: 'Cruzeiro', estado: 'MG', corPrimaria: '#003DA5', cidade: 'Belo Horizonte' },
  { slug: 'pavilhao-independente-cruzeiro', nome: 'Pavilhão Independente', clube: 'Cruzeiro', estado: 'MG', corPrimaria: '#003DA5', cidade: 'Belo Horizonte' },
  { slug: 'mancha-azul-mg', nome: 'Mancha Azul', clube: 'Cruzeiro', estado: 'MG', corPrimaria: '#003DA5', cidade: 'Belo Horizonte' },
  { slug: 'seita-verde', nome: 'Seita Verde', clube: 'América-MG', estado: 'MG', corPrimaria: '#006B3F', cidade: 'Belo Horizonte' },

  // ── Sul ───────────────────────────────────────────────────────────────────
  { slug: 'geral-do-gremio', nome: 'Geral do Grêmio', clube: 'Grêmio', estado: 'RS', corPrimaria: '#0080C8', cidade: 'Porto Alegre' },
  { slug: 'torcida-jovem-gremio', nome: 'Torcida Jovem do Grêmio', clube: 'Grêmio', estado: 'RS', corPrimaria: '#0080C8', cidade: 'Porto Alegre' },
  { slug: 'super-raca-gremista-rs', nome: 'Super Raça Gremista', clube: 'Grêmio', estado: 'RS', corPrimaria: '#0080C8', cidade: 'Porto Alegre' },
  { slug: 'camisa-12-inter', nome: 'Camisa 12', clube: 'Internacional', estado: 'RS', corPrimaria: '#E30613', cidade: 'Porto Alegre' },
  { slug: 'falange-grena-caxias', nome: 'Falange Grená', clube: 'Caxias', estado: 'RS', corPrimaria: '#8B0000', cidade: 'Caxias do Sul' },

  // ── Paraná / Santa Catarina ───────────────────────────────────────────────
  { slug: 'imperio-alviverde', nome: 'Império Alviverde', clube: 'Coritiba', estado: 'PR', corPrimaria: '#006B3F', cidade: 'Curitiba' },
  { slug: 'furia-caterva', nome: 'Fúria Caterva', clube: 'Athletico-PR', estado: 'PR', corPrimaria: '#E30613', cidade: 'Curitiba' },
  { slug: 'torcida-jovem-avai', nome: 'Torcida Jovem do Avaí', clube: 'Avaí', estado: 'SC', corPrimaria: '#0066CC', cidade: 'Florianópolis' },
  { slug: 'torcida-organizada-mancha-azul-sc', nome: 'Mancha Azul', clube: 'Avaí', estado: 'SC', corPrimaria: '#0066CC', cidade: 'Florianópolis' },
  { slug: 'torcida-jovem-figueirense', nome: 'Torcida Jovem do Figueirense', clube: 'Figueirense', estado: 'SC', corPrimaria: '#000000', cidade: 'Florianópolis' },
  { slug: 'torcida-gavioes-alvinegros-sc', nome: 'Gaviões Alvinegros', clube: 'Figueirense', estado: 'SC', corPrimaria: '#000000', cidade: 'Florianópolis' },

  // ── Nordeste / Centro-Oeste (amostra) ─────────────────────────────────────
  { slug: 'trem-bala-fortaleza', nome: 'Trem-Bala', clube: 'Fortaleza', estado: 'CE', corPrimaria: '#E30613', cidade: 'Fortaleza' },
  { slug: 'leoes-da-t-u-f-torcida-uniformizada-do-fortaleza-ce', nome: 'Leões da TUF', clube: 'Fortaleza', estado: 'CE', corPrimaria: '#E30613', cidade: 'Fortaleza' },
  { slug: 'esquadrao-tricolor-bahia', nome: 'Esquadrão Tricolor', clube: 'Bahia', estado: 'BA', corPrimaria: '#003DA5', cidade: 'Salvador' },
  { slug: 'torcida-organizada-bamor-ba', nome: 'Bamor', clube: 'Bahia', estado: 'BA', corPrimaria: '#003DA5', cidade: 'Salvador' },
  { slug: 'torcida-uniformizada-terror-tricolor-ba', nome: 'Terror Tricolor', clube: 'Bahia', estado: 'BA', corPrimaria: '#003DA5', cidade: 'Salvador' },
  { slug: 'barra-brava-sport', nome: 'Barra Brava', clube: 'Sport', estado: 'PE', corPrimaria: '#E30613', cidade: 'Recife' },
  { slug: 'inferno-verde-goias', nome: 'Inferno Verde', clube: 'Goiás', estado: 'GO', corPrimaria: '#006B3F', cidade: 'Goiânia' },
]
