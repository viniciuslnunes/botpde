/**
 * Semeia ~20 eventos com foto na Agenda, cobrindo departamentos canônicos.
 *
 *   node scripts/seed-agenda-demo.js [slug-do-tenant]
 *   (default: pde-gavioes-fiel)
 *
 * Idempotente (IDs fixos). Não remove eventos reais — só upserts demo.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const slug = process.argv[2] ?? 'pde-gavioes-fiel'

/** @param {number} dias @param {number} [hora=19] */
function emDias(dias, hora = 19) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(hora, 0, 0, 0)
  return d
}

/**
 * Capas Unsplash estáveis (futebol / torcida / viagem / ensaio / festa).
 * @param {string} photoId
 */
function foto(photoId) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&q=80`
}

/** @type {Array<{
 *   id: string
 *   departamento: string
 *   tipo: 'GERAL' | 'CARAVANA' | 'ENSAIO'
 *   titulo: string
 *   descricao: string
 *   local: string
 *   dias: number
 *   hora?: number
 *   fotoUrl: string
 *   capacidade?: number
 *   valorVaga?: number
 *   passado?: boolean
 * }>} */
const EVENTOS = [
  {
    id: 'agenda-demo-caravana-01',
    departamento: 'caravanas',
    tipo: 'CARAVANA',
    titulo: 'Caravana clássico — Neo Química Arena',
    descricao:
      'Departamento de Caravanas: embarque no barracão às 12h. Vaga inclui ônibus ida e volta.',
    local: 'Embarque — Sede / Neo Química Arena',
    dias: 5,
    hora: 12,
    fotoUrl: foto('photo-1574629810360-7efbbe195018'),
    capacidade: 48,
    valorVaga: 80,
  },
  {
    id: 'agenda-demo-caravana-02',
    departamento: 'caravanas',
    tipo: 'CARAVANA',
    titulo: 'Caravana fora de casa — Rio',
    descricao: 'Departamento de Caravanas: viagem longa. Check-in com documento e carteirinha.',
    local: 'Rodoviária / Estádio',
    dias: 18,
    hora: 6,
    fotoUrl: foto('photo-1544620341-1adc1baa5c90'),
    capacidade: 52,
    valorVaga: 180,
  },
  {
    id: 'agenda-demo-bateria-01',
    departamento: 'bateria',
    tipo: 'ENSAIO',
    titulo: 'Ensaio semanal da Bateria',
    descricao: 'Departamento de Bateria: presença obrigatória para quem toca no próximo jogo.',
    local: 'Barracão — área de ensaio',
    dias: 2,
    hora: 20,
    fotoUrl: foto('photo-1519892300165-cb5542fb47c7'),
    capacidade: 80,
  },
  {
    id: 'agenda-demo-bateria-02',
    departamento: 'bateria',
    tipo: 'ENSAIO',
    titulo: 'Ensaio especial — ritmos novos',
    descricao: 'Departamento de Bateria: ensaio longo com foco em entrada e saída de campo.',
    local: 'Quadra coberta',
    dias: 9,
    hora: 19,
    fotoUrl: foto('photo-1493225457124-a3eb161ffa5f'),
    capacidade: 60,
  },
  {
    id: 'agenda-demo-bateria-03',
    departamento: 'bateria',
    tipo: 'ENSAIO',
    titulo: 'Aquecimento pré-jogo (Bateria)',
    descricao: 'Departamento de Bateria: ensaio curto no dia do jogo, antes do embarque.',
    local: 'Sede',
    dias: 12,
    hora: 14,
    fotoUrl: foto('photo-1524368535928-5b5e00ddc76b'),
    capacidade: 100,
  },
  {
    id: 'agenda-demo-social-01',
    departamento: 'social-e-eventos',
    tipo: 'GERAL',
    titulo: 'Churrasco da torcida',
    descricao: 'Social e Eventos: confraternização aberta a associados e convidados.',
    local: 'Sede — área externa',
    dias: 7,
    hora: 13,
    fotoUrl: foto('photo-1555939594-58d7cb561ad1'),
    capacidade: 120,
  },
  {
    id: 'agenda-demo-social-02',
    departamento: 'social-e-eventos',
    tipo: 'GERAL',
    titulo: 'Noite de bingo solidário',
    descricao: 'Social e Eventos: arrecadação para o caixa da próxima caravana.',
    local: 'Salão da sede',
    dias: 21,
    hora: 19,
    fotoUrl: foto('photo-1514525253161-7a46d19cd819'),
    capacidade: 90,
  },
  {
    id: 'agenda-demo-comunicacao-01',
    departamento: 'comunicacao',
    tipo: 'GERAL',
    titulo: 'Workshop de conteúdo — Comunicadores',
    descricao: 'Comunicação: treino de stories, mural e cobertura de jogos.',
    local: 'Sala de imprensa / sede',
    dias: 4,
    hora: 18,
    fotoUrl: foto('photo-1492684223066-81342ee5ff30'),
    capacidade: 30,
  },
  {
    id: 'agenda-demo-comunicacao-02',
    departamento: 'comunicacao',
    tipo: 'GERAL',
    titulo: 'Gravação de vinheta da torcida',
    descricao: 'Comunicação: chamada aberta para figurantes e voz oficial.',
    local: 'Estúdio parceiro',
    dias: 15,
    hora: 10,
    fotoUrl: foto('photo-1478737270239-2f02b77fc618'),
    capacidade: 25,
  },
  {
    id: 'agenda-demo-financeiro-01',
    departamento: 'financeiro',
    tipo: 'GERAL',
    titulo: 'Prestação de contas trimestral',
    descricao: 'Financeiro: abertura do caixa e dúvidas sobre mensalidades.',
    local: 'Sala da diretoria',
    dias: 10,
    hora: 19,
    fotoUrl: foto('photo-1554224155-6726b3ff858f'),
    capacidade: 40,
  },
  {
    id: 'agenda-demo-financeiro-02',
    departamento: 'financeiro',
    tipo: 'GERAL',
    titulo: 'Mutirão de renovação de sócios',
    descricao: 'Financeiro + Diretoria: suporte para planos e 2ª via.',
    local: 'Balcão da sede',
    dias: 3,
    hora: 10,
    fotoUrl: foto('photo-1454165804606-c3d57bc86b40'),
    capacidade: 50,
  },
  {
    id: 'agenda-demo-patrimonio-01',
    departamento: 'patrimonio',
    tipo: 'GERAL',
    titulo: 'Inventário de bandeirões e instrumentos',
    descricao: 'Patrimônio: conferência de bens antes da temporada.',
    local: 'Depósito / barracão',
    dias: 6,
    hora: 9,
    fotoUrl: foto('photo-1461896836934-ffe607ba6851'),
    capacidade: 20,
  },
  {
    id: 'agenda-demo-loja-01',
    departamento: 'materiais-loja',
    tipo: 'GERAL',
    titulo: 'Lançamento de camisa — pré-venda na sede',
    descricao: 'Materiais / Loja: retirada e prova de tamanho só para associados.',
    local: 'Loja da sede',
    dias: 8,
    hora: 15,
    fotoUrl: foto('photo-1522778119026-d647f0596c20'),
    capacidade: 60,
  },
  {
    id: 'agenda-demo-feminino-01',
    departamento: 'feminino',
    tipo: 'GERAL',
    titulo: 'Encontro do Departamento Feminino',
    descricao: 'Feminino: roda de conversa e planejamento de ações no estádio.',
    local: 'Sede — sala 2',
    dias: 11,
    hora: 18,
    fotoUrl: foto('photo-1529156069898-49953e39b3ac'),
    capacidade: 35,
  },
  {
    id: 'agenda-demo-feminino-02',
    departamento: 'feminino',
    tipo: 'GERAL',
    titulo: 'Ação solidária — arrecadação de kits',
    descricao: 'Feminino: montagem e entrega de kits na comunidade.',
    local: 'Sede / ponto de distribuição',
    dias: 25,
    hora: 14,
    fotoUrl: foto('photo-1469571486292-0ba58a3f068b'),
    capacidade: 45,
  },
  {
    id: 'agenda-demo-carnaval-01',
    departamento: 'carnaval',
    tipo: 'GERAL',
    titulo: 'Concentração de rua — ensaio de Carnaval',
    descricao: 'Carnaval: ensaio aberto com checklist do barracão.',
    local: 'Concentração — entorno da sede',
    dias: 14,
    hora: 16,
    fotoUrl: foto('photo-1514525253161-7a46d19cd819'),
    capacidade: 200,
  },
  {
    id: 'agenda-demo-carnaval-02',
    departamento: 'carnaval',
    tipo: 'GERAL',
    titulo: 'Mutirão do barracão',
    descricao: 'Carnaval: pintura, costura e organização do material da ala.',
    local: 'Barracão',
    dias: 16,
    hora: 9,
    fotoUrl: foto('photo-1504196606672-aef5c9cefc92'),
    capacidade: 40,
  },
  {
    id: 'agenda-demo-diretoria-01',
    departamento: 'diretoria',
    tipo: 'GERAL',
    titulo: 'Assembleia geral ordinária',
    descricao: 'Diretoria: pauta publicada no mural. Associados em dia têm voz e voto.',
    local: 'Salão nobre',
    dias: 28,
    hora: 19,
    fotoUrl: foto('photo-1431540015161-0bf868a2d407'),
    capacidade: 150,
  },
  {
    id: 'agenda-demo-diretoria-02',
    departamento: 'diretoria',
    tipo: 'GERAL',
    titulo: 'Recepção de novos sócios',
    descricao: 'Diretoria: boas-vindas, kit e apresentação dos departamentos.',
    local: 'Sede',
    dias: 1,
    hora: 18,
    fotoUrl: foto('photo-1529156069898-49953e39b3ac'),
    capacidade: 40,
  },
  {
    id: 'agenda-demo-passado-01',
    departamento: 'social-e-eventos',
    tipo: 'GERAL',
    titulo: 'Jogo em casa — pré-jogo na sede (arquivo)',
    descricao: 'Social: evento passado para preencher a lista “Anteriores”.',
    local: 'Sede',
    dias: -4,
    hora: 16,
    fotoUrl: foto('photo-1574629810360-7efbbe195018'),
    capacidade: 100,
    passado: true,
  },
]

async function main() {
  console.log(`🌱 Agenda demo no tenant '${slug}'…\n`)

  const tenant = await db.tenant.findUnique({ where: { slug } })
  if (!tenant) throw new Error(`Tenant '${slug}' não encontrado.`)

  const ownerRole = await db.userRole.findFirst({
    where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
    select: { userId: true },
  })
  if (!ownerRole) throw new Error(`Tenant '${slug}' sem owner.`)
  const autorId = ownerRole.userId

  const sede = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE', ativa: true },
    select: { id: true, nome: true },
  })

  for (const ev of EVENTOS) {
    const data = emDias(ev.dias, ev.hora ?? 19)
    await db.evento.upsert({
      where: { id: ev.id },
      update: {
        titulo: ev.titulo,
        descricao: `[${ev.departamento}] ${ev.descricao}`,
        fotoUrl: ev.fotoUrl,
        data,
        local: ev.local,
        tipo: ev.tipo,
        capacidade: ev.capacidade ?? null,
        valorVaga: ev.tipo === 'CARAVANA' && ev.valorVaga != null ? ev.valorVaga : null,
        // Global na torcida — escopo por unidade esconde de quem não tem sedeId.
        sedeId: null,
      },
      create: {
        id: ev.id,
        tenantId: tenant.id,
        titulo: ev.titulo,
        descricao: `[${ev.departamento}] ${ev.descricao}`,
        fotoUrl: ev.fotoUrl,
        data,
        local: ev.local,
        tipo: ev.tipo,
        capacidade: ev.capacidade ?? null,
        valorVaga: ev.tipo === 'CARAVANA' && ev.valorVaga != null ? ev.valorVaga : null,
        sedeId: null,
        criadoPorId: autorId,
      },
    })
    console.log(`✅ [${ev.departamento}] ${ev.tipo} — ${ev.titulo}`)
  }

  console.log(`\n🎉 ${EVENTOS.length} eventos na agenda de '${slug}'.`)
  console.log('   Ver: /portal/eventos e /admin/eventos')
  console.log('   Filtros: ?tipo=CARAVANA | ?tipo=ENSAIO')
}

main()
  .catch((err) => {
    console.error('❌', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
