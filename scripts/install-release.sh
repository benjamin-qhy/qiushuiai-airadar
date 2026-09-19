#!/bin/sh
set -eu

repository="benjamin-qhy/qiushuiai-airadar"
old_root="$HOME/.airadar"
new_root="$HOME/.qiushuiai-airadar"
program_root="$new_root/installed-program"
port="${AIRADAR_PORT:-43120}"

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

release_json="$temporary/release.json"
curl -fsSL -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$repository/releases/latest" -o "$release_json"
version="$(node -e "const r=require(process.argv[1]); const v=String(r.tag_name||'').replace(/^v/,''); if(!/^\\d+\\.\\d+\\.\\d+$/.test(v)) process.exit(1); process.stdout.write(v)" "$release_json")"
package="airadar-cli-$version.tgz"
base="https://github.com/$repository/releases/download/v$version"

curl -fL "$base/$package" -o "$temporary/$package"
curl -fL "$base/$package.sha256" -o "$temporary/$package.sha256"
(cd "$temporary" && shasum -a 256 -c "$package.sha256")

for cli in "$old_root/installed-program/bin/airadar" "$new_root/installed-program/bin/airadar"; do
  if [ -x "$cli" ]; then "$cli" service stop >/dev/null 2>&1 || true; fi
done

if [ -d "$old_root" ] && [ -e "$new_root" ]; then
  echo "迁移已停止：$old_root 和 $new_root 同时存在，请先人工确认数据。" >&2
  exit 1
fi
if [ -d "$old_root" ]; then
  if [ "$(uname -s)" = "Darwin" ]; then
    uid="$(id -u)"
    launchctl bootout "gui/$uid/ai.qiushuiai.airadar-v2" >/dev/null 2>&1 || true
  fi
  mv "$old_root" "$new_root"
  echo "已迁移 $old_root -> $new_root"
fi

mkdir -p "$new_root/backups"
chmod 700 "$new_root" "$new_root/backups"
if [ -d "$new_root/installed-data" ]; then
  backup="$new_root/backups/$(date +%Y%m%d-%H%M%S)-before-$version"
  mkdir -p "$backup"
  cp -R "$new_root/installed-data" "$backup/installed-data"
  echo "数据备份：$backup"
fi

npm install -g --prefix "$program_root" --ignore-scripts --no-audit --no-fund "$temporary/$package"
cli="$program_root/bin/airadar"
"$cli" service install --port "$port"
installed_version="$("$cli" --version)"
if [ "$installed_version" != "$version" ]; then
  echo "版本校验失败：期望 $version，实际 $installed_version" >&2
  exit 1
fi
curl --noproxy '*' --retry 10 --retry-connrefused --retry-delay 1 -fsS \
  "http://127.0.0.1:$port/health" >/dev/null
echo "AI Radar $version 已安装并运行：http://127.0.0.1:$port"
