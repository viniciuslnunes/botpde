# Time de agentes — Torcida SaaS

Modelo de trabalho assistido por IA: **Opus planeja, Fable implementa.** Os agentes
vivem em `.claude/agents/*.md` e são invocáveis pelo Claude Code (aparecem em
`/agents`). Este README explica quando usar cada um.

## Papéis

| Agente | Quando usar | Model |
|---|---|---|
| `research-dominio` | Entender o nicho, benchmarks, riscos — antes de decidir | opus |
| `aliancas-torcidas` | Estudar alianças/rivalidades; recomendar aliados na config | opus |
| `product-strategy` | Decidir o quê construir e em que ordem | opus |
| `data-model` | Propor/validar entidades Prisma e integridade | opus |
| `rbac` | Permissões, autorização e visibilidade cross-tenant | opus |
| `ux-review` | Revisar fluxo/telas (usa o skill `impeccable` no detalhe visual) | opus |
| `qa-verification` | Verificar antes de dar como pronto; rodar Vitest | opus |
| `implementation` | Codificar o combinado, com escopo mínimo | **fable** |

## Fluxo recomendado por feature

1. **Entender** → `research-dominio` (+ `aliancas-torcidas` se for do tema).
2. **Recortar** → `product-strategy` decide escopo e fase.
3. **Modelar** → `data-model` (dados) + `rbac` (acesso/visibilidade).
4. **Desenhar** → `ux-review` valida jornada e estados.
5. **Fechar plano** (Opus) → aprovação humana.
6. **Implementar** → `implementation` (Fable) segue `CLAUDE.md`.
7. **Verificar** → `qa-verification` confere DoD e roda testes.

## Princípios

- Não implementar antes de o plano estar fechado e aprovado.
- Escopo mínimo e seguro; reutilizar o que já existe.
- Autorização sempre no servidor; auditar toda mutação.
- Cada feature justificada pelo domínio — nada de recurso "bonito" sem valor.
