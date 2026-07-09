# Captura visual de fluxos (Playwright)

Não é teste de regressão pixel-a-pixel — é **andar pelos fluxos principais e
salvar PNGs** em `e2e/screenshots/<fluxo>/<etapa>.png`, para depois alimentar
uma sessão de Claude Code (agente `ux-review`, que aciona o skill `impeccable`
no detalhe visual) com evidência real de tela, sem depender de descrição.

## Uso

```bash
# 1ª vez só: baixa o binário do Chromium usado pelo Playwright
pnpm --filter @torcida/web exec playwright install chromium

pnpm --filter @torcida/web dev            # servidor rodando em outro terminal
pnpm --filter @torcida/web test:e2e       # loga sozinho e recaptura tudo
```

O login é automático: o projeto `setup` (`e2e/auth.setup.ts`) entra via
Credentials (e-mail/senha) usando `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` de
`apps/web/.env.local` (nunca commitado) e salva a sessão em
`e2e/.auth/user.json` antes de rodar os specs `*.portal.spec.ts`. Sem esses
dois valores no `.env.local`, `test:e2e` falha com uma mensagem explicando o
que falta.

`e2e/.auth/user.json` (sessão) e `e2e/screenshots/` (PNGs) **não são commitados**
(ver `.gitignore`) — são artefato local para revisão, não fixture de CI.

Se o `next dev` já estiver rodando em outra porta (ex.: 3001, porque a 3000
estava ocupada), rode com a URL certa:
```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm --filter @torcida/web test:e2e
```

Por que Credentials e não OAuth (Discord/Google) na captura automática:
Google bloqueia login em browser controlado por automação ("esse navegador ou
app pode não ser seguro") e Discord exigiria reautorizar manualmente a cada
sessão — nenhum dos dois é repetível sem intervenção humana. Login social
continua funcionando normalmente para usuários reais; a suíte só evita depender
dele.

### Alternativa manual (login social, uma sessão só)
Se quiser mesmo assim capturar telas logado via Discord (ex.: pra revisar algo
específico do fluxo OAuth), ainda dá pra gerar a sessão manualmente:
```bash
pnpm --filter @torcida/web test:e2e:login
# faça login no browser que abrir e feche a janela — sobrescreve e2e/.auth/user.json
```

## Adicionando um fluxo

- Arquivo `*.publico.spec.ts` → não precisa de login (ex.: `/`, `/entrar`).
- Arquivo `*.portal.spec.ts` → roda com a sessão do projeto `setup`.
- Use o helper `snapshot(page, 'nome-do-fluxo', 'NN-etapa')` de `e2e/snapshot.ts`
  para manter o nome de arquivo estável entre execuções.
- `sitemap.portal.spec.ts` cobre rotas estáticas (sem `[id]`); telas de detalhe
  (ex.: `/portal/eventos/[id]`) precisam de um registro real — adicione um
  spec dedicado quando for revisar uma delas.

## Entregando ao Claude Code

Depois de rodar `test:e2e`, aponte o agente `ux-review` para `e2e/screenshots/`
(ou anexe os PNGs na conversa) — ele já sabe ler essa pasta como parte do
diagnóstico de UI/UX.
