#!/usr/bin/env bash
# Onboarding mecânico da máquina de desenvolvimento (Torcida SaaS).
# Idempotente. Usado pelo agente /setup. Compatível com bash 3.2+ (macOS).
#
# Exit codes: 0 ok | 1 pré-req | 2 Docker | 3 sync | 4 env
#
# Uso:
#   bash scripts/dev-setup.sh
#   bash scripts/dev-setup.sh --skip-sync --secrets-file ./torcida-dev.secrets.env

set -euo pipefail

SKIP_SYNC=0
SKIP_INSTALL=0
SECRETS_FILE=""
LOCAL_URL='postgresql://torcida:torcida@localhost:5432/torcida'

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-sync) SKIP_SYNC=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --secrets-file)
      SECRETS_FILE="${2:-}"
      shift 2
      ;;
    *) echo "Flag desconhecida: $1" >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

step() { printf '==> %s\n' "$*"; }
ok() { printf '    OK: %s\n' "$*"; }
warn() { printf '    ! %s\n' "$*"; }
die() { local code="$1"; shift; printf 'ERRO (%s): %s\n' "$code" "$*" >&2; exit "$code"; }

# Lê KEY=value de um .env (sem BOM). stdout = valor ou vazio.
read_env_var() {
  local file="$1" name="$2"
  [ -f "$file" ] || { printf ''; return 0; }
  awk -F= -v name="$name" '
    BEGIN { sub(/^\xEF\xBB\xBF/, "", name) }
    {
      line=$0
      sub(/^\xEF\xBB\xBF/, "", line)
      if (index(line, "#") == 1) next
      split(line, a, "=")
      key=a[1]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key == name) {
        val=substr(line, length(key)+2)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
        gsub(/^["'\'']|["'\'']$/, "", val)
        print val
        exit
      }
    }
  ' "$file"
}

is_placeholder() {
  local v="${1:-}"
  [ -z "$v" ] && return 0
  echo "$v" | grep -qiE 'your_|change.?me|exemplo|example\.com|xxxx|password_here|secret_here'
}

ensure_env_file() {
  local target="$1" example="$2"
  if [ -f "$target" ]; then return 1; fi
  mkdir -p "$(dirname "$target")"
  if [ -f "$example" ]; then
    cp "$example" "$target"
  else
    : > "$target"
  fi
  return 0
}

set_env_key() {
  local file="$1" name="$2" value="$3"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  local tmp
  tmp="$(mktemp)"
  awk -v name="$name" -v value="$value" '
    BEGIN { found=0 }
    {
      line=$0
      sub(/^\xEF\xBB\xBF/, "", line)
      if (line ~ ("^[[:space:]]*" name "[[:space:]]*=")) {
        print name "=" value
        found=1
      } else {
        print line
      }
    }
    END { if (!found) print name "=" value }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

# Merge sem clobber: chave já preenchida (não placeholder) no target vence.
merge_secrets() {
  local secrets="$1" target="$2"
  [ -f "$secrets" ] || die 4 "Arquivo de secrets não encontrado: $secrets"
  touch "$target"
  local tmp keys_file added=0 skipped=0
  tmp="$(mktemp)"
  keys_file="$(mktemp)"

  # Chaves na ordem: target primeiro, depois secrets
  {
    sed '1s/^\xEF\xBB\xBF//' "$target"
    echo
    sed '1s/^\xEF\xBB\xBF//' "$secrets"
  } | awk -F= '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      key=$1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key != "" && !(key in seen)) {
        print key
        seen[key]=1
      }
    }
  ' > "$keys_file"

  : > "$tmp"
  while IFS= read -r key || [ -n "$key" ]; do
    [ -z "$key" ] && continue
    local tval sval
    tval="$(read_env_var "$target" "$key")"
    sval="$(read_env_var "$secrets" "$key")"
    if [ -n "$tval" ] && ! is_placeholder "$tval"; then
      printf '%s=%s\n' "$key" "$tval" >> "$tmp"
      skipped=$((skipped + 1))
    elif [ -n "$sval" ]; then
      printf '%s=%s\n' "$key" "$sval" >> "$tmp"
      added=$((added + 1))
    elif [ -n "$tval" ]; then
      printf '%s=%s\n' "$key" "$tval" >> "$tmp"
    fi
  done < "$keys_file"

  # Preserva linhas que não são KEY= (comentários do target) no topo? Mantemos só KEY=.
  # Reanexa comentários do target no início se o arquivo era só secrets-merge.
  mv "$tmp" "$target"
  rm -f "$keys_file"
  ok "merge secrets → $target (preenchidas=$added, preservadas=$skipped)"
}

get_remote_url() {
  local c u
  for c in "$ROOT/apps/web/.env.local" "$ROOT/packages/db/.env"; do
    u="$(read_env_var "$c" DATABASE_URL_RAILWAY)"
    [ -z "$u" ] && u="$(read_env_var "$c" DATABASE_URL)"
    if [ -n "$u" ] && ! echo "$u" | grep -qE 'localhost|127\.0\.0\.1'; then
      printf '%s\n' "$u"
      return 0
    fi
  done
  printf ''
}

run_sync() {
  local source_url="$1"
  local dump_dir="$ROOT/.dumps"
  mkdir -p "$dump_dir"
  local stamp dump_name
  stamp="$(date +%Y%m%d-%H%M%S)"
  dump_name="railway-${stamp}.dump"
  step "Dump da Railway → $dump_name"
  docker run --rm -v "${dump_dir}:/dump" postgres:18 \
    pg_dump --format=custom --no-owner --no-acl --file "/dump/$dump_name" "$source_url" \
    || die 3 "pg_dump falhou"
  docker exec -i torcida-postgres-dev psql -U torcida -d torcida -v ON_ERROR_STOP=1 \
    -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' \
    || die 3 "falha ao recriar schema public"
  local local_from_container
  local_from_container="$(echo "$LOCAL_URL" | sed 's/localhost/host.docker.internal/')"
  docker run --rm -v "${dump_dir}:/dump" postgres:18 \
    pg_restore --no-owner --no-acl --dbname "$local_from_container" "/dump/$dump_name" || true
  docker exec -i torcida-postgres-dev psql -U torcida -d torcida -v ON_ERROR_STOP=1 \
    -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;' \
    || die 3 "falha ao criar pg_trgm"
  docker exec -i torcida-postgres-dev psql -U torcida -d torcida -c \
    "SELECT count(*) AS tabelas FROM information_schema.tables WHERE table_schema='public';"
}

# ── 1. Detect ───────────────────────────────────────────────────────────────
step 'Detectando pré-requisitos'
command -v node >/dev/null || die 1 'Node não encontrado. Instale Node 20 LTS.'
NODE_V="$(node -v)"
echo "$NODE_V" | grep -qE '^v(2[0-9]|[3-9][0-9])' || die 1 "Node $NODE_V — precisa >= 20.x"
ok "Node $NODE_V"

command -v pnpm >/dev/null || die 1 'pnpm não encontrado. Rode: corepack enable && corepack prepare pnpm@9.15.9 --activate'
ok "pnpm $(pnpm -v)"

command -v docker >/dev/null || die 1 'Docker CLI não encontrado. Instale Docker Desktop / Engine. Ver docs/ops/postgres-local-dev.md'
ok 'Docker CLI'
docker info >/dev/null 2>&1 || die 2 'Docker engine não responde. Suba o daemon / Docker Desktop.'
ok 'Docker engine'

# ── 2. Deps ─────────────────────────────────────────────────────────────────
if [ "$SKIP_INSTALL" -eq 0 ]; then
  step 'pnpm install'
  pnpm install || die 1 'pnpm install falhou'
  ok 'dependências'
else
  warn 'pulando pnpm install (--skip-install)'
fi

# ── 3. Env ──────────────────────────────────────────────────────────────────
step 'Arquivos de ambiente'
WEB_ENV="$ROOT/apps/web/.env.local"
WEB_EXAMPLE="$ROOT/apps/web/.env.example"
DB_ENV="$ROOT/packages/db/.env"

if ensure_env_file "$WEB_ENV" "$WEB_EXAMPLE"; then ok "criado $WEB_ENV a partir do example"; else ok "já existe $WEB_ENV"; fi
if [ ! -f "$DB_ENV" ]; then
  set_env_key "$DB_ENV" DATABASE_URL "$LOCAL_URL"
  ok "criado $DB_ENV"
else
  ok "já existe $DB_ENV"
fi

if [ -z "$SECRETS_FILE" ]; then
  for c in "$ROOT/torcida-dev.secrets.env" "$ROOT/apps/web/.env.team" "$ROOT/.env.team"; do
    if [ -f "$c" ]; then SECRETS_FILE="$c"; break; fi
  done
fi
if [ -n "$SECRETS_FILE" ]; then
  merge_secrets "$SECRETS_FILE" "$WEB_ENV"
  rail="$(read_env_var "$WEB_ENV" DATABASE_URL_RAILWAY)"
  dburl="$(read_env_var "$WEB_ENV" DATABASE_URL)"
  [ -n "$rail" ] && set_env_key "$DB_ENV" DATABASE_URL_RAILWAY "$rail"
  [ -n "$dburl" ] && set_env_key "$DB_ENV" DATABASE_URL "$dburl"
else
  warn 'nenhum pacote de secrets encontrado (torcida-dev.secrets.env / .env.team). Ver docs/ops/dev-secrets.md'
fi

MISSING=""
for key in AUTH_SECRET TENANT_SLUG SUPER_ADMIN_EMAILS; do
  v="$(read_env_var "$WEB_ENV" "$key")"
  if is_placeholder "$v"; then
    if [ -z "$MISSING" ]; then MISSING="$key"; else MISSING="$MISSING $key"; fi
  fi
done
if [ -n "$MISSING" ]; then
  warn "chaves ainda faltando ou placeholder: $MISSING"
  warn 'Preencha manualmente ou passe --secrets-file. Continuando infra...'
fi

# ── 4. DB ───────────────────────────────────────────────────────────────────
step 'Subindo Postgres local (docker compose)'
docker compose -f docker-compose.dev.yml up -d || die 2 'docker compose up falhou'

healthy=0
i=0
while [ "$i" -lt 30 ]; do
  i=$((i + 1))
  status="$(docker inspect --format='{{.State.Health.Status}}' torcida-postgres-dev 2>/dev/null || echo missing)"
  if [ "$status" = "healthy" ]; then healthy=1; break; fi
  if [ "$status" = "unhealthy" ]; then
    docker logs torcida-postgres-dev 2>&1 | tail -20
    die 2 'Container unhealthy. Ver volume /var/lib/postgresql no compose (docs/ops/postgres-local-dev.md).'
  fi
  sleep 2
done
[ "$healthy" -eq 1 ] || die 2 'Timeout esperando healthcheck do torcida-postgres-dev'
ok 'torcida-postgres-dev healthy'

# ── 5–6. Sync + point local ─────────────────────────────────────────────────
REMOTE="$(get_remote_url)"
if [ -n "$REMOTE" ]; then
  set_env_key "$WEB_ENV" DATABASE_URL_RAILWAY "$REMOTE"
  set_env_key "$DB_ENV" DATABASE_URL_RAILWAY "$REMOTE"
fi
set_env_key "$WEB_ENV" DATABASE_URL "$LOCAL_URL"
set_env_key "$DB_ENV" DATABASE_URL "$LOCAL_URL"
ok 'DATABASE_URL → localhost nos dois .env'

if [ "$SKIP_SYNC" -eq 1 ]; then
  warn 'pulando sync (--skip-sync)'
elif [ -z "$REMOTE" ]; then
  warn 'sem DATABASE_URL_RAILWAY / URL remota — banco local pode estar vazio. Sync pulado.'
else
  step 'Sync Railway → local'
  run_sync "$REMOTE" || die 3 'sync falhou'
  set_env_key "$WEB_ENV" DATABASE_URL "$LOCAL_URL"
  set_env_key "$DB_ENV" DATABASE_URL "$LOCAL_URL"
  ok 'sync concluído'
fi

# ── 7. Prisma ───────────────────────────────────────────────────────────────
step 'prisma generate'
pnpm --filter @torcida/db db:generate || die 1 'db:generate falhou'
ok 'Prisma Client'

# ── 8. Smoke ────────────────────────────────────────────────────────────────
step 'Smoke'
docker exec torcida-postgres-dev psql -U torcida -d torcida -tAc 'SELECT 1' >/dev/null \
  || die 2 'SELECT 1 falhou no Postgres local'
TABLES="$(docker exec torcida-postgres-dev psql -U torcida -d torcida -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '[:space:]')"
ok "SELECT 1 ok — tabelas public=$TABLES"

echo
echo 'Setup concluído.'
echo '  Subir web:  pnpm --filter @torcida/web dev'
echo '  Login seed: senha m1k43l3n (usuários de seed)'
echo '  Docs:       docs/ops/postgres-local-dev.md | docs/ops/dev-secrets.md'
if [ -n "$MISSING" ]; then
  echo "  Pendente:   preencha $MISSING em apps/web/.env.local"
  exit 4
fi
exit 0
