# Módulo — Bandeiras (o trapo da torcida)

> 11º departamento canônico (2026-08-06). Bandeirão e faixa **são** patrimônio,
> mas o Patrimônio virou inventário geral (mesa, cadeira, projetor) e quem
> cuida do trapo não precisa — nem deve — abrir o inventário inteiro.
> Não é módulo novo: é o inventário recortado em `categoria: BANDEIRA`, mais os
> dois fatos que só a bandeira tem (vistoria de entrada e escala de jogo).

## Por que existe

Na torcida organizada, bandeira e bateria são o patrimônio simbólico — e têm
gente própria cuidando. Quando o Patrimônio passou a cobrir mobiliário e
eletrônicos, o departamento de Bandeiras ficou sem lugar: para guardar um
bandeirão era preciso `patrimony:manage`, que abre projetor e cadeira junto.
O recorte por permissão resolve isso sem duplicar módulo.

## Escopo

| Inclui | Fora (por ora) |
|--------|----------------|
| Acervo: bandeirões, faixas, mastros (`categoria: BANDEIRA`) | Módulo de portal próprio |
| Empréstimo com foto de saída e de guarda (já obrigatório) | Reserva futura / fila de retirada |
| Ficha de **vistoria** (medidas, mastro, órgão, validade) | Upload do documento de liberação |
| Escala de jogo pela Agenda (`Evento` com `partidaId`) | Lista de escala paralela à Agenda |
| Confecção e reforma como `Projeto` do departamento | Controle de tecido/insumo |

## RBAC — a decisão central

```
patrimony:view / patrimony:manage  → inventário INTEIRO (inclui bandeira)
flags:view     / flags:manage      → SOMENTE categoria BANDEIRA
```

- `patrimony:manage` gere bandeira. `flags:manage` **não** gere o resto — é a
  assimetria que dá sentido ao departamento.
- A trava é da **query**, não da UI: `resolverEscopoPatrimonio`
  (`packages/types/src/patrimonio.js`) devolve `categoriaTravada`, e
  `listarPatrimonio` / `resumirPatrimonio` / `listarEmprestimosPatrimonio`
  aplicam esse recorte **depois** do filtro do usuário — query param nunca
  amplia escopo.
- Escrita passa por `podeGerirCategoriaPatrimonio(perms, categoria)`. Na
  **edição**, a categoria é checada duas vezes: a de origem e a de destino —
  sem isso `flags:manage` reclassificaria um bandeirão como `MOBILIARIO` e
  ficaria com item fora do próprio escopo.
- Gate web: `apps/web/src/lib/patrimonio-authz.ts`
  (`assertAcervoView`, `assertAcervoEscrita`, `garantirCategoriaPermitida`,
  `assertPodeGerirItem`). Recusa de escopo é `ExpectedError` — regra de
  negócio, não bug.

### Pacote canônico

| Papel | Permissões |
|---|---|
| **Colaborador** | `flags:view`, `community:post`, `messages:send`, `groups:create`, `meetings:host` |
| **Gestor +** | `flags:manage`, `events:create`, `events:manage`, `announcements:publish`, `channels:manage`, `community:manage`, `community:moderate`, `patrimony:view`, `finance:view`, `reports:view` |

Deliberado: o colaborador **não** leva `patrimony:view` — vê só bandeira. O
gestor leva `patrimony:view` (saber onde a peça está guardada junto do resto)
mas **não** `patrimony:manage`; e `finance:view` sem `finance:manage`, porque
confecção sai como despesa rateada no livro-caixa, não como caixa próprio.

## Modelo

Sem tabela nova. `PatrimonioItem.meta` (`Json?`) guarda a ficha:

```jsonc
{ "vistoria": {
    "larguraM": 12, "alturaM": 8, "comMastro": true,
    "orgao": "SCCP — segurança do estádio", "protocolo": "…",
    "validade": "2027-01-31", "observacao": "…"
} }
```

Contrato puro em `packages/types/src/patrimonio.js`:
`VistoriaBandeiraSchema`, `lerVistoriaBandeira` (nunca estoura em dado
antigo/torto — devolve `null`), `gravarVistoriaBandeira` (preserva o resto do
`meta`), `vistoriaVencendo`.

**`validade` ausente não alarma.** Liberação sem prazo declarado é o caso
comum; tratá-la como vencida treinaria o gestor a ignorar o aviso — mesmo
princípio de `progressoMeta` sem meta em `projeto.js`. Item `BAIXADO` também
não entra na cobrança: não vai a jogo.

## Superfícies

- **Portal** — cockpit `/portal/departamentos/bandeiras` (`portalPanel:
  'bandeiras'`): a primeira aba (**Acervo**) mostra a grade com foto das
  peças — o mesmo card do admin. Membro com `flags:view` (ou
  `patrimony:view`) vê; cadastro, edição, vistoria e exclusão só com
  `flags:manage` / `patrimony:manage`. Números e alerta de liberação de
  entrada ficam como contexto acima da grade. Áreas, projetos e equipe
  são os universais de departamento.
- **Acervo** — `/portal/patrimonio?categoria=BANDEIRA`. Quem entrou por
  `flags:*` vê a página **como Bandeiras** (título, ícone, filtro de categoria
  suprimido, categoria travada no formulário) — é o recorte dele, não um
  Patrimônio capado.
- **Admin** — `/admin/bandeiras` (`flags:manage` ou `patrimony:manage`, com
  gestoria da área no menu): KPIs e `AdminTabs` (`?tab=`): **Acervo** (default,
  cards com foto de catálogo), Fora agora (foto de saída), Precisa de você.
  Edição/exclusão no modal (unsaved-changes + confirmação). A ficha de vistoria
  entra no mesmo modal. Aba **Histórico** (`?tab=historico`): baixas e
  exclusões permanentes de bandeiras, com ator e data.
- **Áreas canônicas** — Acervo e guarda · Escala de jogo · Confecção e reforma
  · Vistoria e liberação (`departamento-areas-canonicas.js`).

## Escala de jogo

Reusa `Evento` com `partidaId` na Agenda — mesmo padrão do aside `#escala` da
Bateria. **Não** existe lista de escala paralela: quem leva o trapo confirma
presença no evento do jogo. O cockpit (Painel) sugere a receita quando há
`Partida` no horizonte sem esse evento; Ativar cria o `Evento` GERAL +
checklist `escala-de-jogo` se a frente existir.

## Depois do deploy

```bash
pnpm --filter @torcida/db db:generate
pnpm --filter @torcida/db db:push            # PatrimonioItem.meta
pnpm --filter @torcida/db seed:departamentos # cria Bandeiras nos tenants
pnpm --filter @torcida/db seed:departamento-areas
pnpm --filter @torcida/db db:repair-canais-departamentos
```

O Railway só roda `prisma generate` no build — `db:push` e os seeds são
manuais.

## Anti-padrões

- Dar `patrimony:manage` ao gestor de Bandeiras "para simplificar" — apaga a
  razão do departamento existir.
- Filtrar bandeira só na UI e deixar a query aberta: `flags:view` viraria
  `patrimony:view` na primeira URL montada à mão.
- Criar tabela `Bandeira` separada de `PatrimonioItem`: o empréstimo com
  evidência fotográfica, o inventário e a baixa já existem e são os mesmos.
- Lista de escala fora da Agenda.
- Transformar a vistoria em módulo de compliance (anexos, workflow de
  aprovação, histórico versionado).
