/**
 * ScriptRunner Behaviours — Create view (KAN)
 * Affected field: description
 * Run: on load
 * Spaces: KAN · Types: Story, Bug, Task
 *
 * Pré-preenche DoD do agente qa-verification se a description estiver vazia.
 * API: https://docs.adaptavist.com/sr4jc/latest/features/behaviours/behaviours-api
 */

const desc = getFieldById('description');
const current = desc.getValue();

function isEmpty(val) {
  if (val == null || val === '') return true;
  if (typeof val === 'string') return val.trim().length === 0;
  // ADF
  if (val.type === 'doc' && Array.isArray(val.content)) {
    const text = JSON.stringify(val.content);
    return text.length < 40;
  }
  return false;
}

if (!isEmpty(current)) {
  // não sobrescreve o que o usuário já digitou
} else {
  const lines = [
    '## DoD (Torcida)',
    '',
    '- [ ] Mutação admin chama `assertPermission`',
    '- [ ] `AuditLog` em mutação administrativa',
    '- [ ] UI: estados vazio / erro / loading',
    '- [ ] Queries SaaS filtram `tenantId`',
    '- [ ] Retorno Prisma tipado (sem `any`)',
    '- [ ] Schema? Se sim: label `schema` + `docs/ops/schema-deploy.md`',
    '- [ ] Perf: sem polling cego / N+1 óbvio no feed',
    '',
    '## Contexto',
    '',
    '(preencher)',
  ];

  desc.setValue({
    type: 'doc',
    version: 1,
    content: lines.map((line) =>
      line.length === 0
        ? { type: 'paragraph', content: [] }
        : {
            type: 'paragraph',
            content: [{ type: 'text', text: line }],
          },
    ),
  });
}
