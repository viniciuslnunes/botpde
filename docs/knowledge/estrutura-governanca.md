# Base de conhecimento — Estrutura e governança interna das torcidas organizadas

> Como uma torcida organizada realmente se organiza por dentro. Insumo direto
> para RBAC (cargos/permissões), modelo de dados (departamentos, escalões) e
> produto (jornadas do associado). Fontes consultadas em 2026-07-10.

## Natureza jurídica

- Torcida organizada é **associação civil sem fins lucrativos** (Código
  Civil, arts. 53–61), com CNPJ, estatuto registrado em cartório, assembleia,
  diretoria eleita e prestação de contas. Fonte: Jusbrasil, "A personalidade
  jurídica das torcidas organizadas".
- O estatuto obrigatoriamente define: denominação/fins/sede; requisitos de
  admissão, demissão e **exclusão** de associados; direitos e deveres;
  fontes de recursos; órgãos deliberativos; regras de alteração estatutária e
  dissolução; forma de gestão. Fonte: idem.
- A Lei Geral do Esporte adiciona requisitos próprios (cadastro de membros,
  responsabilidade objetiva) — ver [`contexto-legal.md`](contexto-legal.md).

## Hierarquia típica (escalões)

```
Assembleia geral (associados)
└── Conselho deliberativo / vitalício  ← ex-presidentes, fundadores, velha guarda
    └── Diretoria executiva
        ├── Presidente
        ├── Vice-presidente(s)
        ├── Secretário / 1º e 2º secretários
        ├── Tesoureiro / diretor financeiro
        ├── Diretor de patrimônio
        └── Conselho fiscal
            └── Diretorias/departamentos temáticos (abaixo)
                └── Representações territoriais (subsedes / "batalhões" / embaixadas)
                    └── Associados (com carteirinha e mensalidade)
```

- **Velha guarda**: fundadores e membros históricos; frequentemente formam
  conselho vitalício com poder moral e de veto informal. Fonte: UFES
  (dissertação sobre torcidas de Vitória); ABANT (estudo TUP).
- **Batalhões / subsedes**: divisões por cidade ou bairro, cada uma com
  representante e vice — espelho direto da hierarquia Sede → Subsede → PDE do
  sistema. Fonte: UFES.
- **Questão geracional**: tensão documentada entre "jovens da Jovem" e velha
  guarda (renovação × tradição). Fonte: UFU, "Os jovens da Jovem".
- Grandes torcidas fazem **eleições disputadas** com chapas, campanha e
  milhares de votantes (caso Gaviões da Fiel, com eleições anuais
  historicamente concorridas). Fonte: Ludopédio, "As eleições nos Gaviões da
  Fiel" (B. Buarque de Hollanda).

## Departamentos típicos

| Departamento | Função | Observações para o produto |
|---|---|---|
| Bateria (batucada) | ritmo na arquibancada; ensaios | agenda própria de ensaios |
| Caravanas / viagens | logística de deslocamento p/ jogos fora | RSVP, pagamento, listas de embarque |
| Social / eventos | festas, ações beneficentes, churrascos na sede | módulo de eventos atual |
| Materiais / loja | camisas, bandeiras, produtos oficiais | módulo Loja atual |
| Patrimônio | sede, instrumentos, bandeirões | inventário é dor real |
| Financeiro | mensalidades, prestação de contas | recorrência + inadimplência |
| Comunicação / mídia | redes sociais, comunicados | módulo Comunicados atual |
| Departamento feminino | organização das mulheres na torcida | liderança feminina em ascensão, mas ainda minoritária (Ludopédio, "Mulheres no comando") |
| Carnaval (quando há escola) | direção de carnaval, barracão, direção musical, carnavalesco | operação paralela grande (Gaviões, Mancha, TUP, Camisa 12) |

Fontes: ABANT (TUP); futebolinterior.com.br; paranashop; USP/ECA (TCC sobre
torcida) — consulta 2026-07-10.

## Modelo associativo

- Filiação: ficha cadastral + mensalidade + carteirinha; a carteirinha dá
  acesso a sede, caravanas, desconto em materiais e ingressos de setor.
- Receitas típicas: mensalidades, venda de materiais, eventos/festas,
  caravanas, (nas escolas de samba) carnaval.
- **Periodicidades reais variam por torcida.** Exemplo âncora (Gaviões da
  Fiel, site oficial 2026-08-02): planos **quadrimensal** e **anual** para
  novos sócios, **mensal** em renovação, mais taxa de emissão de carteirinha
  — ver `torcidas-brasil.md` § Gaviões. O SaaS hoje modela
  `MENSAL | TRIMESTRAL | ANUAL | UNICA` (`PlanoAssociacao`); **quadrimensal
  não cabe** sem estender o enum. Confiança média (site da torcida; valores
  divergem entre páginas).
- **Exceção importante**: o modelo **barra brava** (Geral do Grêmio, 2001) é
  de livre adesão — sem mensalidade, sem uniforme, sem cadastro. Nem todo
  tenant potencial tem a mesma operação. Fonte: Wikipédia/barrabrava.net.

## Representação nacional

- **ANATORG** (Associação Nacional das Torcidas Organizadas, 2014): entidade
  guarda-chuva; 247 torcidas afiliadas em 21 estados (2019); publica censos
  sobre perfil de lideranças (I Censo) e percepção de violência (II Censo).
  Interlocutora do movimento com o poder público — inclusive pedindo mudanças
  na Lei Geral do Esporte na Câmara. Fontes: anatorg.com.br; Câmara dos
  Deputados; ResearchGate; Redalyc — consulta 2026-07-10.

## Modelo associativo — dois níveis de vínculo (atualização 2026-07-16)

O produto modela dois tipos de vínculo com a torcida — real no nicho, não é
só um detalhe técnico: `SaasMembro.tipo = SOCIO | TORCEDOR`.

- **Sócio**: associado cadastrado e (em geral) pagante da torcida organizada,
  com ficha/carteirinha — o "membro" tradicional do estatuto.
- **Torcedor**: simpatizante da **afiliação** (o time), sem vínculo formal com
  nenhuma organizada específica — a persona de topo do funil de aquisição
  (perfil global, `PerfilTorcedor`, feed da Comunidade Nacional).

Um torcedor pode iniciar um processo de admissão e virar sócio de uma torcida
específica; nem todo torcedor vira sócio.

### Admissão de associado (figura estatutária, hoje só documentada como "exclusão")

`StatusMembro = PENDENTE / APROVADO / REPROVADO`, com `aprovadoPor`/`aprovadoEm`
e `imagemProva` (comprovante de vínculo) implementam a **admissão** exigida
pelo estatuto (Código Civil art. 54: requisitos de admissão) — não só a
exclusão. É fluxo com aprovação da diretoria e auditoria (`MEMBERS_APPROVE`).
`imagemProva` é dado pessoal — tratar com a mesma cautela de retenção/minimização
que os demais dados sensíveis de cadastro (ver `contexto-legal.md`).

**Departamento pretendido no recrutamento ≠ lotação na área.** Na vida real o
candidato informa em qual diretoria/departamento quer atuar; a diretoria só
lotaciona **depois** de admitir. No produto: `SaasMembro.departamentoId` é a
intenção; `UserDepartamento` / perfil `Membro · {Área}` só após `APROVADO`
(`docs/data/modulo-departamentos.md` § preferência ≠ membership, 2026-07-17).
Reprovado ou pendente **nunca** aparece na equipe do departamento.

## Mapeamento para o produto (RBAC e dados)

1. Cargos reais → papéis do sistema: Presidente = owner; diretoria executiva
   = admins com escopos (financeiro, eventos, comunicação, loja); conselho
   fiscal = leitura de auditoria/financeiro; representantes de
   batalhão/subsede = admin de núcleo local; associado = member.
2. **Departamentos** já existem no schema como par de papéis **Colaborador
   (MEMBRO)** e **Gestor (GESTOR)** por área, com "Diretoria" tratada como
   departamento — ver `docs/data/modulo-departamentos.md` para o modelo
   completo (a lista de departamentos típicos acima é o vocabulário real
   para seeds/sugestões: bateria, caravanas, social, materiais, patrimônio,
   financeiro, comunicação, feminino, carnaval). Um Gestor de departamento
   administra membros daquele depto sem precisar de `ROLES_MANAGE` global —
   delegação pontual por design.
3. **Exclusão de associado** é figura estatutária formal (e obrigação prática
   pós-LGE). No produto já existe `members:dismiss` (desligamento estatutário,
   distinto de `members:block`/`members:warn`), no pacote gestor da Diretoria
   canônica e no catálogo `PERMISSIONS` (`packages/types/src/permissions.js`).
   Fonte: código + auditoria funcional 2026-07; confiança alta.
4. Eleições internas com chapas são realidade nas grandes — enquetes/votação
   (módulo Salas) têm caso de uso forte.
