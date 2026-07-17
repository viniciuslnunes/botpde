# Credenciais E2E / agentes de teste — template

1. Copie este arquivo:
   ```bash
   cp apps/web/e2e/CREDENTIALS.local.example.md apps/web/e2e/CREDENTIALS.local.md
   ```
2. Preencha e-mail/senha da conta de teste (super-admin recomendado).
3. Espelhe em `apps/web/.env.local`:
   ```bash
   E2E_TEST_EMAIL=seu@email.com
   E2E_TEST_PASSWORD=sua-senha
   ```

`CREDENTIALS.local.md` está no `.gitignore` — nunca commitado.

## Conta de teste (super-admin)

| Campo | Valor |
|-------|--------|
| Papel | Super-admin (`SUPER_ADMIN_EMAILS`) |
| E-mail | _(preencher)_ |
| Senha | _(preencher)_ |
