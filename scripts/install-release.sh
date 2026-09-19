#!/bin/sh
set -eu

repository="benjamin-qhy/qiushuiai-airadar"
old_root="$HOME/.airadar"
new_root="$HOME/.qiushuiai-airadar"
program_root="$new_root/program"
production_data_root="$new_root/production-data"
port="${QIUSHUIAI_AIRADAR_PORT:-43120}"

command -v curl >/dev/null 2>&1 || { echo "缺少 curl" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "缺少 npm，请先安装 Node.js 24" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "缺少 Node.js 24" >&2; exit 1; }

node_version="$(node -p 'process.versions.node')"
node_major="${node_version%%.*}"
if [ "$node_major" != "24" ]; then
  echo "需要 Node.js 24，当前是 $node_version" >&2
  exit 1
fi

temporary="$(mktemp -d "${TMPDIR:-/tmp}/qiushuiai-airadar-install.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

release_json="$temporary/qiushuiai-airadar-release.json"
curl -fsSL \
  "https://github.com/$repository/releases/latest/download/qiushuiai-airadar-release.json" \
  -o "$release_json"
version="$(node -e "const r=require(process.argv[1]); const v=String(r.version||''); if(!/^\\d+\\.\\d+\\.\\d+$/.test(v)||r.package!=='qiushuiai-airadar-cli-'+v+'.tgz'||r.checksum!==r.package+'.sha256') process.exit(1); process.stdout.write(v)" "$release_json")"
package="qiushuiai-airadar-cli-$version.tgz"
base="https://github.com/$repository/releases/download/v$version"

curl -fL "$base/$package" -o "$temporary/$package"
curl -fL "$base/$package.sha256" -o "$temporary/$package.sha256"
(cd "$temporary" && shasum -a 256 -c "$package.sha256")

if [ -e "$old_root" ] && [ -e "$new_root" ]; then
  echo "迁移已停止：$old_root 和 $new_root 同时存在，请先人工确认数据。" >&2
  exit 1
fi

# Stop every service name used by released predecessors before moving data.
for cli in \
  "$old_root/installed-program/bin/airadar" \
  "$new_root/installed-program/bin/airadar" \
  "$new_root/program/bin/qiushuiai-airadar"
do
  if [ -x "$cli" ]; then "$cli" service stop >/dev/null 2>&1 || true; fi
done
if [ "$(uname -s)" = "Darwin" ]; then
  uid="$(id -u)"
  for label in ai.qiushuiai.airadar-installed ai.qiushuiai.airadar-v2 ai.qiushuiai.qiushuiai-airadar-installed; do
    launchctl bootout "gui/$uid/$label" >/dev/null 2>&1 || true
  done
fi

if [ -d "$old_root" ]; then
  mv "$old_root" "$new_root"
  echo "已迁移 $old_root -> $new_root"
fi

mkdir -p "$new_root/backups"
chmod 700 "$new_root" "$new_root/backups"
stamp="$(date +%Y%m%d-%H%M%S)"
if [ "$(uname -s)" = "Darwin" ]; then
  for plist in +    "$HOME/Library/LaunchAgents/ai.qiushuiai.airadar-installed.plist" +    "$HOME/Library/LaunchAgents/ai.qiushuiai.airadar-v2.plist" +    "$HOME/Library/LaunchAgents/ai.qiushuiai.qiushuiai-airadar-installed.plist"
  do
    if [ -f "$plist" ]; then
      name="$(basename "$plist")"
      mv "$plist" "$new_root/backups/legacy-$stamp-$name"
    fi
  done
fi

move_legacy_directory() {
  source="$1"
  target="$2"
  if [ ! -e "$source" ]; then return; fi
  if [ -e "$target" ]; then
    echo "迁移已停止：$source 和 $target 同时存在，请先人工确认数据。" >&2
    exit 1
  fi
  mv "$source" "$target"
}

# The active development service used single-table-data. dev-data is an older
# snapshot and is retained separately when both exist.
if [ -d "$new_root/single-table-data" ]; then
  move_legacy_directory "$new_root/single-table-data" "$new_root/development-data"
elif [ -d "$new_root/dev-data" ]; then
  move_legacy_directory "$new_root/dev-data" "$new_root/development-data"
fi
if [ -d "$new_root/dev-data" ]; then
  mv "$new_root/dev-data" "$new_root/backups/legacy-development-data-$stamp"
fi

move_legacy_directory "$new_root/installed-data" "$production_data_root"

rename_legacy_database() {
  data_root="$1"
  if [ ! -f "$data_root/airadar.sqlite" ]; then return; fi
  if [ -e "$data_root/qiushuiai-airadar.sqlite" ]; then
    echo "迁移已停止：$data_root 中同时存在新旧数据库，请先人工确认数据。" >&2
    exit 1
  fi
  for suffix in "" "-shm" "-wal"; do
    if [ -e "$data_root/airadar.sqlite$suffix" ]; then
      mv "$data_root/airadar.sqlite$suffix" "$data_root/qiushuiai-airadar.sqlite$suffix"
    fi
  done
}
rename_legacy_database "$new_root/development-data"
rename_legacy_database "$production_data_root"

# Preserve earlier program/service directories before assigning the canonical
# names to the currently installed release.
if [ -d "$new_root/installed-program" ]; then
  if [ -e "$program_root" ]; then
    mv "$program_root" "$new_root/backups/legacy-program-$stamp"
  fi
  mv "$new_root/installed-program" "$program_root"
fi
if [ -d "$new_root/installed-service" ]; then
  if [ -e "$new_root/service" ]; then
    mv "$new_root/service" "$new_root/backups/legacy-service-$stamp"
  fi
  mv "$new_root/installed-service" "$new_root/service"
fi

if [ -d "$production_data_root" ]; then
  backup="$new_root/backups/$stamp-before-$version"
  mkdir -p "$backup"
  cp -R "$production_data_root" "$backup/production-data"
  echo "正式数据备份：$backup"
fi

npm install -g --prefix "$program_root" --ignore-scripts --no-audit --no-fund "$temporary/$package"
cli="$program_root/bin/qiushuiai-airadar"
"$cli" service install --port "$port"
installed_version="$("$cli" --version)"
if [ "$installed_version" != "$version" ]; then
  echo "版本校验失败：期望 $version，实际 $installed_version" >&2
  exit 1
fi
curl --noproxy '*' --retry 10 --retry-connrefused --retry-delay 1 -fsS \
  "http://127.0.0.1:$port/health" >/dev/null
echo "qiushuiai-airadar $version 已安装并运行：http://127.0.0.1:$port"
