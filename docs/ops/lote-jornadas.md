# Lote de jornadas — teste dos fluxos de entrada, canais e permissões

Complemento dos seeds de volume (`seed:corinthians-teste`,
`seed:nacional-teste`). Enquanto aqueles produzem **massa**, este produz
**caminho**: pessoas que entram no produto pelas Server Actions reais, pelos
três fluxos de entrada, e cujo estado final é conferido contra uma matriz
declarada.

## O buraco que ele fecha

Os seeds de volume gravam `SaasMembro` com `createMany`. O banco fica com o
*resultado* de um vínculo que nunca aconteceu — e tudo que mora no caminho
some:

| Some no `createMany` | Quem faz de verdade |
| --- | --- |
| Inscrição no canal oficial da unidade / Sede | `vincularMembroCanaisAposAprovacao` |
| Cargo `member` (base de `messages:send`, `community:post`) | `concederAcessoBasico`, em `aprovarMembro` |
| Espelho do vínculo na Sede raiz (Caso B) | `sincronizarSocioNaSedeRaiz` |
| `PerfilTorcedor.onboardingConcluidoEm` | `concluirPerfilTorcedor` |
| `AuditLog` da solicitação e da decisão | as actions de admissão |
| Notificação ao solicitante | `notificarNovoMembroPendente` |

Foi por causa disso que o lote Corinthians precisou de
`repair-aprovado-canal-membro` para parar de mentir sobre canais. O lote de
jornadas não precisa de repair: ele nasce pelo caminho.

## Os quatro fluxos

Três portas de entrada no produto — a de sócio se divide em dois caminhos com
telas e validações diferentes:

| Fluxo | Action | Estado inicial |
| --- | --- | --- |
| `torcedor_global` | `salvarClubeRegiao` + `concluirComoTorcedor` | sem `SaasMembro`; vive na Comunidade Nacional |
| `torcedor_torcida` | `solicitarVinculo({ tipo: 'TORCEDOR' })` | APROVADO na hora, sem fila |
| `socio_vinculo` («já sou sócio») | `solicitarVinculo({ tipo:'SOCIO', caminhoSocio:'EXISTENTE' })` | PENDENTE, com nº de associado + carteirinha + prova |
| `socio_associacao` («quero me associar») | `solicitarVinculo({ tipo:'SOCIO', caminhoSocio:'NOVO' })` | PENDENTE, sem nº (aguarda emissão) |

A decisão da diretoria é `aprovarMembro` / `reprovarMembro` de verdade —
inclusive a reprovação com laudo (categoria + motivo + etapas erradas).

O estado esperado de cada `(fluxo × desfecho)` está em `ESPERADO_POR_FLUXO`
(`apps/web/src/lib/__seed__/_jornadas.ts`). **Mudança de regra de negócio
começa por essa tabela** — é contra ela que a auditoria compara, não contra
prosa.

## Entrada por link de convite

A entrada é por `/convite/<slug>`, resolvido por `resolverConvite`. É o
caminho que nenhum seed exercitava, e o **único** que existe para unidade com
canal restrito (R5) — ela não aparece na vitrine pública.

`seed:convites-teste` gera/reativa os links numa matriz de destinos escolhida
por eixo, não por volume:

| Destino | Eixo que só ele cobre |
| --- | --- |
| `pde-gavioes-fiel` | Sede raiz com 14 unidades — canal da unidade × canal da Sede |
| `subsede-rio-claro` | unidade Caso B promovida — vínculo nasce na unidade e espelha na Sede |
| `camisa-12-corinthians` | torcida coirmã — mesma CN, malhas administrativas separadas |
| `pavilhao-nove` | terceira torcida do mesmo clube — contraste entre pares |
| `fiel-sao-vicente` | unidade Caso B com canais próprios |
| `pde-fiel-baixada-...` | unidade Caso B **sem** canal provisionado — expõe o buraco |
| `mancha-alviverde` | outro clube (Palmeiras) — rivalidade cross-clube |
| `torcida-jovem-flamengo` | outro clube (Flamengo) — CN distinta |
| `geral-do-gremio` | quarto clube na malha nacional |

O seed de convites espelha `gerarConviteTenant`: mesmo formato de slug
(`randomBytes(6).base64url`), mesma herança de `afiliacaoId` do ancestral,
mesmo `AuditLog`. O link daqui é indistinguível de um gerado pela tela.

## Canais

Depois da admissão, o lote exercita o ciclo de canais com gente dentro:

1. Um sócio aprovado por torcida é **promovido a admin** pela tela real
   (`salvarAcessoUsuario`) — criar canal exige `channels:manage` ou
   `community:manage`, que só liderança tem.
2. Ele cria quatro canais temáticos, um por visibilidade: `TENANT`,
   `HIERARQUIA`, `ALIADOS` e `PUBLICO`. O `TENANT` nasce **fechado**
   (`publica: false`) — é o único jeito de exercitar `pedirEntradaCanal` +
   `decidirPedidoCanal`.
3. Os demais aprovados entram em **todos** os abertos e pedem entrada no
   fechado; a decisão aprova a maioria e recusa um a cada três, para a fila de
   pedidos existir nos dois estados.
4. Torcedor sem torcida ativa cai no ramo Comunidade Nacional de
   `entrarCanal`, que só aceita canal `PUBLICO` — a recusa nos demais é a
   regra funcionando, e o seed a registra como conforme, não como erro. Foi
   exercitando esse caminho que se descobriu o §7 16: o ramo valida tudo e
   então esbarra num gate que exige `SaasMembro`, então **nunca** conclui para
   o público que ele atende.
5. Cada canal com membro recebe posts de mural (`publicarPostCanal`).

## Áreas de atuação e projetos

Os dois módulos mais novos (2026-08-03) estavam com o banco **literalmente
vazio**: zero `DepartamentoAreaMembro` e zero `Projeto` em toda a plataforma.
A regra que os define — *área e projeto não concedem permissão* — não podia
ser verificada nem à mão: não havia o que olhar.

O lote fecha isso pelo caminho real. O sócio declara um departamento no
vínculo (preferência), a aprovação a transforma em membership
(`aplicarDepartamentoPreferido`), e então o admin promovido:

1. cria uma área com `criarAreaDepartamento`;
2. coloca os sócios do departamento dentro com
   `adicionarMembroAreaDepartamento` — `assertElegivelParaArea` só aceita quem
   já está no departamento, e é por isso que a preferência importa;
3. marca um deles `RESPONSAVEL` (`definirResponsavelArea`) — o papel que
   **parece** cargo e não pode conceder nada; sem uma linha dessas a regra não
   é testável;
4. cria um `Projeto` do tipo CAMPANHA ligado à área, adiciona os participantes
   e registra o realizado.

`audit:areas-projetos` então confere, sobre o banco inteiro e não por amostra:
membro e responsável de área sem poder de gestão; membro de área sempre
subconjunto do departamento; a regra pura `resolverAreasDepartamento` num
cenário extremo (responsável de *todas* as áreas sem gestoria ⇒ `podeGerir`
continua falso); participante e responsável de projeto sem poder; lançamento
financeiro rateado sem atravessar torcida; e os gates das actions recusando
sócio comum e gestor de outro tenant.

> Nas sondas de gate, o payload precisa **passar no Zod**. Uma recusa por
> schema (`"Invalid input"`) é um verde falso: o gate nunca chegou a rodar. A
> auditoria detecta esse caso e o reporta como erro dela mesma.

## Senha única

Todo usuário de seed nasce com `senhaHash` de **`m1k43l3n`**
(`packages/db/scripts/lib/senha-teste.js`). Sem isso o provider de
credenciais recusa o login e nenhum cenário pode ser conferido de dentro.

`db:senha-teste` faz o backfill nos lotes semeados antes da convenção. O
guard é o domínio: nenhuma conta real muda de senha, nem com `--forcar`.

## Auditoria

`audit:jornadas` mede **cada** usuário do lote (sem amostragem — vazamento
aparece em um registro, não na média):

- **A. Estado por fluxo** — vínculo, `vinculoAutorizaContextoTenant`,
  `podeVerFeedSocios` contra `ESPERADO_POR_FLUXO`.
- **B. Canais** — canal da unidade × canal da Sede por desfecho; todo membro
  ATIVO passando por `podeVerCanal` do próprio contexto; canal fechado
  recusando entrada direta; nenhum membro fora da linhagem/aliados.
- **C. Permissões** — pendente e reprovado sem nenhuma; torcedor sem o pacote
  de sócio; sócio aprovado com `messages:send` e liderança só com cargo que a
  conceda; nenhuma permissão fora das torcidas do vínculo; `?escopo=torcida`
  não furando o gate na query string.

O fluxo de cada pessoa é **derivado do banco** (`tipo`, `status`,
`numeroAssociado`), não de uma coluna que o seed gravasse — auditar a própria
anotação do seed não provaria nada sobre o produto.

## Comandos

```bash
# 1. links de convite (idempotente; --rotacionar invalida os antigos)
pnpm --filter @torcida/db seed:convites-teste

# 2. o lote (persiste; idempotente por destino)
pnpm --filter @torcida/web seed:jornadas

# 3. conferir
pnpm --filter @torcida/web audit:jornadas
pnpm --filter @torcida/web audit:areas-projetos
pnpm --filter @torcida/web audit:achados

# senha nos lotes antigos
pnpm --filter @torcida/db db:senha-teste

# limpar só este lote
pnpm --filter @torcida/db reset:jornadas -- --dry-run
pnpm --filter @torcida/db reset:jornadas
```

Saídas em disco: `seed-jornadas.txt` (credenciais por torcida) e
`auditoria-jornadas.txt`, ambos na raiz de `apps/web`.

## Marcação e reset

| Entidade | Marcador |
| --- | --- |
| `User` | e-mail em `@jornada.torcida.app` |
| `Conversa` (canal temático) | `nome` começa com `[JORNADA]` |
| `Post` | autor do lote, ou conteúdo com `[JORNADA]`, ou dentro de canal do lote |

`reset:jornadas` **não** reverte os links de convite: são configuração da
torcida, não dado do lote, e continuam úteis para navegar à mão.

## O que o método já encontrou

Achados que só apareceram porque o caminho foi percorrido de verdade — nenhum
deles é visível num banco semeado por `createMany`:

| # | Achado | Status |
| --- | --- | --- |
| §7 13 | Escalada de privilégio por `salvarPerfilComposto` — `admin` sem `settings:manage` criava cargo com ela | corrigido (`assertPodeDelegar`) |
| §7 14 | `salvarAcessoUsuario` e `solicitarVinculo` sem `timeout` de transação — promoção a admin falhava em 5/5 torcidas; inscrição válida no Gaviões devolvia "tente novamente" | corrigido |
| §7 15 | Sócio aprovado nasce com carteirinha vencida quando declara cartão físico antigo, e fica barrado em todos os canais | em aberto (decisão de produto) |
| §7 16 | O ramo de Comunidade Nacional de `entrarCanal` é inalcançável — valida tudo e cai num gate que exige `SaasMembro` | em aberto (decisão de produto) |

Além disso, `audit:achados` mostrou que **sete** dos doze itens de §7 já
estavam corrigidos e continuavam listados como pendentes. É o argumento do
método: status anotado à mão envelhece; status medido, não.

## Rodando tudo de uma vez

```bash
pnpm --filter @torcida/web audit:tudo            # as 13 suítes
pnpm --filter @torcida/web audit:tudo -- --rapidas  # pula as que passam de ~3 min
```

Sequencial de propósito: várias mutam e revertem no mesmo banco remoto; em
paralelo disputariam as mesmas linhas e produziriam achados falsos.

O resumo separa três coisas que costumam ser confundidas:

- **conforme** — a regra foi exercitada e vale;
- **alerta** — item em aberto conhecido, ou cenário que o banco não tinha como
  exercitar (`"nenhum X no banco"` não é aprovação);
- **não rodou** — a suíte nem executou. Isto **não** é "sem achados", e o
  runner recusa a tratá-lo como sucesso.

A terceira distinção é a que mais importa numa bateria grande: uma suíte que
falha ao carregar some silenciosamente de um `&&` encadeado, e a bateria fica
verde sem ter medido nada.
