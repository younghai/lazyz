#!/usr/bin/env bash
# =============================================================================
# dogfood.sh — xcode 로 xcode 를 고치게 하고, 객관적으로 판정한다.
#
#   ./scripts/dogfood.sh "packages/ai 에 X 를 추가해줘"
#   ./scripts/dogfood.sh --model deepseek-v4-pro "…"
#   ./scripts/dogfood.sh --keep "…"        # 작업 사본을 지우지 않는다
#   ./scripts/dogfood.sh --readonly "…"    # 조사 태스크 — 무변경이 성공
#
# 왜 이게 필요한가:
#   벤치 픽스처는 파일 5개짜리 장난감이다. 실제 저장소는 64파일 13,000줄이고,
#   상호참조가 얽혀 있고, 타입 검사가 있고, 테스트가 191건 있다.
#   **픽스처가 만들 수 없는 종류의 실패가 여기서 나온다.**
#
# 안전:
#   실제 저장소는 절대 건드리지 않는다. rsync 로 임시 사본을 만들고 거기서만 돈다.
#   판정도 사본에서 한다. 쓸 만한 변경은 사람이 보고 직접 옮긴다.
#
# 판정 (에이전트의 자기 보고가 아니라 우리가 잰다):
#   · 사본이 처음에 초록이었는가        — 아니면 이 실행은 무의미하다
#   · 작업 뒤 check.sh 가 통과하는가    — lint · 타입
#   · 작업 뒤 test.sh 가 통과하는가     — 191건
#   · 무엇이 바뀌었는가                 — 파일 목록과 줄 수
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL=""
KEEP=0
READONLY=0
PROMPT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --keep)  KEEP=1; shift ;;
    # 조사 태스크는 **안 바꾸는 것이 정답**이다. 그때는 무변경을 성공으로 센다.
    --readonly) READONLY=1; shift ;;
    *)       PROMPT="$1"; shift ;;
  esac
done

if [ -z "$PROMPT" ]; then
  echo "쓸 작업을 달라: ./scripts/dogfood.sh \"…\"" >&2
  exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/xcode-dogfood-XXXXXX")"
[ "$KEEP" -eq 0 ] && trap 'rm -rf "$WORK"' EXIT

echo "▸ 작업 사본 만드는 중 — $WORK"
rsync -a \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'bench/results' \
  --exclude 'dist' \
  --exclude 'build' \
  "$ROOT/" "$WORK/"

# 타입 검사와 lint 는 node_modules 가 필요하다.
#
# **링크로 붙이면 안 된다.** 워크스페이스 심링크(@xcode/* → ../../packages/*)가
# 원본 저장소를 가리켜서, 사본 안의 상대 경로가 원본 파일에 닿는다.
# 실제로 이렇게 뚫려 원본이 수정됐다 — 툴 쪽 가드(safePath)도 같이 고쳤지만
# 하네스가 애초에 그런 통로를 만들지 않는 것이 맞다.
cp -R "$ROOT/node_modules" "$WORK/node_modules"
# 사본 안의 워크스페이스 링크는 사본을 가리키게 다시 건다.
if [ -d "$WORK/node_modules/@xcode" ]; then
  for link in "$WORK"/node_modules/@xcode/*; do
    [ -L "$link" ] || continue
    target="$(readlink "$link")"
    rm -f "$link"
    ln -s "$WORK/${target#../../}" "$link"
  done
fi

# --- 기준선: 사본이 처음부터 초록이어야 한다 --------------------------------
echo "▸ 기준선 확인"
BASE_CHECK=0; BASE_TEST=0
( cd "$WORK" && ./scripts/check.sh >/dev/null 2>&1 ) || BASE_CHECK=1
( cd "$WORK" && ./test.sh >/dev/null 2>&1 ) || BASE_TEST=1
if [ "$BASE_CHECK" -ne 0 ] || [ "$BASE_TEST" -ne 0 ]; then
  echo "✗ 사본이 처음부터 빨갛다 (check=$BASE_CHECK test=$BASE_TEST). 이 실행은 무의미하다." >&2
  exit 1
fi
echo "  ✓ check · test 통과"

# shasum 은 perl 에 딸려 오고, 리눅스에서는 sha1sum 이 기본이다. 있는 것을 쓴다.
HASH_CMD=$(command -v shasum || command -v sha1sum)
if [ -z "$HASH_CMD" ]; then echo "shasum/sha1sum 이 없다" >&2; exit 1; fi

BEFORE="$(mktemp)"
( cd "$WORK" && find packages apps scripts -type f \( -name '*.ts' -o -name '*.sh' \) -not -path '*/dist/*' | sort | xargs $HASH_CMD ) > "$BEFORE"

# --- 실행 -------------------------------------------------------------------
ARGS=(-p --cwd "$WORK" --approve --max-turns 50)
[ -n "$MODEL" ] && ARGS+=(--model "$MODEL")
ARGS+=("$PROMPT")

echo "▸ xcode 실행 — $PROMPT"
echo "────────────────────────────────────────────────────────────"
STARTED=$(date +%s)
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  "$ROOT/apps/cli/bin/xcode.ts" "${ARGS[@]}"
RUN_EXIT=$?
ELAPSED=$(( $(date +%s) - STARTED ))
echo "────────────────────────────────────────────────────────────"
echo

# --- 판정 -------------------------------------------------------------------
AFTER="$(mktemp)"
( cd "$WORK" && find packages apps scripts -type f \( -name '*.ts' -o -name '*.sh' \) -not -path '*/dist/*' | sort | xargs $HASH_CMD ) > "$AFTER"

CHANGED="$(diff <(cut -d' ' -f3- "$BEFORE") <(cut -d' ' -f3- "$AFTER") >/dev/null 2>&1; comm -3 <(sort "$BEFORE") <(sort "$AFTER") | awk '{print $2}' | sort -u)"

echo "▸ 바뀐 파일"
if [ -z "$CHANGED" ]; then
  echo "    (없음)"
else
  echo "$CHANGED" | sed 's/^/    /'
fi
echo

echo "▸ 검증 (에이전트 보고가 아니라 우리가 잰다)"
CHECK_OUT="$(cd "$WORK" && ./scripts/check.sh 2>&1)"; CHECK=$?
TEST_OUT="$(cd "$WORK" && ./test.sh 2>&1)"; TEST=$?

if [ "$CHECK" -eq 0 ]; then echo "    ✓ check.sh (lint · 타입)"; else
  echo "    ✗ check.sh"; echo "$CHECK_OUT" | grep -E "error|✗" | head -6 | sed 's/^/        /'
fi

PASS=$(echo "$TEST_OUT" | grep -oE '^ℹ pass [0-9]+' | grep -oE '[0-9]+' || echo 0)
FAIL=$(echo "$TEST_OUT" | grep -oE '^ℹ fail [0-9]+' | grep -oE '[0-9]+' || echo 0)
if [ "$TEST" -eq 0 ]; then echo "    ✓ test.sh — $PASS 통과"; else
  echo "    ✗ test.sh — $PASS 통과 / $FAIL 실패"
  echo "$TEST_OUT" | grep -E "^✖" | head -6 | sed 's/^/        /'
fi

echo
echo "▸ 요약"
echo "    xcode exit $RUN_EXIT · ${ELAPSED}초 · 바뀐 파일 $(echo "$CHANGED" | grep -c . )개"
[ "$KEEP" -eq 1 ] && echo "    작업 사본: $WORK"

if [ "$CHECK" -eq 0 ] && [ "$TEST" -eq 0 ] && [ -n "$CHANGED" ]; then
  echo "    ✓ 초록인 채로 무언가를 바꿨다"
  exit 0
fi
if [ -z "$CHANGED" ]; then
  if [ "$READONLY" -eq 1 ]; then
    echo "    ✓ 조사만 하고 아무것도 바꾸지 않았다 (요구대로)"
    exit 0
  fi
  echo "    ! 아무것도 바꾸지 않았다"
  exit 1
fi
# 조사 태스크인데 바꿨다면 그게 실패다.
if [ "$READONLY" -eq 1 ]; then
  echo "    ✗ 조사만 하라고 했는데 파일을 바꿨다"
  exit 1
fi
echo "    ✗ 바꿨지만 초록이 아니다"
exit 1
