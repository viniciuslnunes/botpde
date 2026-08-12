/**
 * ScriptRunner Listener — Issue Updated (KAN)
 * Quando o label `audit-finding` é adicionado, comenta o comando de medição.
 *
 * Event: Issue Updated
 * Restrict in UI to project KAN if possible; script also guards by key.
 *
 * HAPI / Cloud: https://docs.adaptavist.com/sr4jc/latest/features
 */

def issue = Issues.getByKey(issue.key as String)
if (issue.projectObject?.key != 'KAN' && issue.getProjectKey() != 'KAN') {
  // team-managed / API variance
  if (!(issue.key as String).startsWith('KAN-')) return
}

def labels = (issue.labels ?: [])*.label ?: (issue.labels ?: [])
def names = labels.collect { it instanceof String ? it : (it.name ?: it.toString()) }
if (!names.any { it?.equalsIgnoreCase('audit-finding') }) {
  return
}

def marker = '[torcida:audit-finding]'
def existing = issue.comments?.any { (it.body as String)?.contains(marker) }
if (existing) return

issue.addComment("""${marker}
Achado de auditoria (ARCHITECTURE §7 / audits).

Status é **medido**, não anotado:
```
pnpm --filter @torcida/web audit:achados
```

Só feche (Done) quando a sonda imprimir FECHADO para este item.
Component sugerido: ops-ci.
Doc: docs/ops/jira-kan.md
""")
