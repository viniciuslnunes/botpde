/**
 * ScriptRunner Listener — Issue Created / Updated (KAN)
 * Priority Highest → comentário de alerta para o time.
 */

def issue = Issues.getByKey(issue.key as String)
if (!(issue.key as String).startsWith('KAN-')) return

def p = issue.priority?.name
if (p != 'Highest' && p != 'Highest priority') {
  // Cloud UI sometimes "Highest"
  if (p?.toLowerCase() != 'highest') return
}

def marker = '[torcida:critical]'
if (issue.comments?.any { (it.body as String)?.contains(marker) }) return

issue.addComment("""${marker}
Prioridade **Highest** em KAN.

- Confirmar impacto em produção / HML
- Se tocar `schema.prisma`: label `schema` + schema-deploy.md
- Avisar ops (`ops@setorize.com`) se for incidente
""")
