/**
 * ScriptRunner Behaviours — Transition view (KAN)
 * Affected fields: description (setDescription help text), labels (read)
 * Run: on load + on change (labels)
 *
 * Se o issue tem label `schema`, exige atenção ao checklist de schema-deploy
 * antes de concluir Homolog/Done.
 */

const labelsField = getFieldById('labels');
const desc = getFieldById('description');

function hasSchemaLabel() {
  const v = labelsField.getValue();
  if (!v) return false;
  const arr = Array.isArray(v) ? v : [v];
  return arr.some((l) => {
    const name = typeof l === 'string' ? l : l?.name || l?.value || '';
    return String(name).toLowerCase() === 'schema';
  });
}

if (hasSchemaLabel()) {
  desc.setRequired(true);
  desc.setDescription(
    'Label `schema` ativa: complete o checklist em docs/ops/schema-deploy.md ' +
      '(HML → prod). Não marque Done sem db:push no alvo certo.',
  );
} else {
  desc.setRequired(false);
  desc.setDescription('');
}
