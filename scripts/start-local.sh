#!/usr/bin/env bash
# Starts the app on this computer (macOS or Linux). It uses Node.js 22.18 or
# later when the computer has it. If not, it downloads a private copy of
# Node.js 22 into .node/, checks it against the official SHA-256 sums, and uses
# that: no admin rights, and nothing changes outside this folder. This is the
# one script that is not TypeScript, because it runs before Node.js exists.
set -euo pipefail
cd "$(dirname "$0")/.."

node_is_new_enough() {
  local version
  version="$("$1" -p 'process.versions.node' 2>/dev/null)" || return 1
  local major="${version%%.*}" rest="${version#*.}"
  local minor="${rest%%.*}"
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 18 ]; }
}

if [ -z "${PRIVATE_NODE:-}" ] && command -v node >/dev/null 2>&1 && node_is_new_enough node; then
  echo "This computer has Node.js $(node --version). The script uses it."
else
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) echo "This script is for macOS and Linux. On Windows, see README.md." >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) echo "This processor ($(uname -m)) is not supported. Install Node.js 22 from nodejs.org." >&2; exit 1 ;;
  esac
  if ! { [ -x .node/bin/node ] && node_is_new_enough .node/bin/node; }; then
    echo "This computer has no Node.js 22.18 or later. The script downloads a private copy into .node/."
    base="https://nodejs.org/dist/latest-v22.x"
    sums="$(curl -fsSL "$base/SHASUMS256.txt")"
    file="$(printf '%s\n' "$sums" | awk -v end="-$os-$arch.tar.gz" 'substr($2, length($2) - length(end) + 1) == end { print $2; exit }')"
    expected="$(printf '%s\n' "$sums" | awk -v name="$file" '$2 == name { print $1 }')"
    [ -n "$file" ] && [ -n "$expected" ] || { echo "The list of Node.js files has no $os-$arch file. Install Node.js 22 from nodejs.org." >&2; exit 1; }
    download="$(mktemp -d)"
    trap 'rm -rf "$download"' EXIT
    curl -fSL --progress-bar "$base/$file" -o "$download/$file"
    if command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$download/$file" | awk '{ print $1 }')"
    else
      actual="$(shasum -a 256 "$download/$file" | awk '{ print $1 }')"
    fi
    [ "$actual" = "$expected" ] || { echo "The download is not correct: its SHA-256 sum is wrong. Do the step again." >&2; exit 1; }
    rm -rf .node
    mkdir -p .node
    tar -xzf "$download/$file" -C .node --strip-components=1
  fi
  export PATH="$PWD/.node/bin:$PATH"
  echo "The script uses the private Node.js $(node --version) in .node/."
fi

npm ci --no-audit --no-fund
START_LOCAL=1 npm run setup
npm run serve
