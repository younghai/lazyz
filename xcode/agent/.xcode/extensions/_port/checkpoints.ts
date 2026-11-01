/**
 * 파일 체크포인트 — 세션 분기의 **빠진 짝**.
 *
 * 세션 트리는 대화를 fork/clone 한다. 「verify 실패 직후로 되돌아가서 다시 해보자」가
 * 되는 이유다. 그런데 되돌아간 그 지점에서 **파일은 이미 고쳐진 상태**다.
 * 대화만 과거로 가고 코드는 현재에 남는다 — 분기 서사가 절반만 참이었다.
 *
 * 설계 원칙 셋:
 *
 *   ① **사용자의 git 을 건드리지 않는다.** stash·index·HEAD·브랜치 어느 것도.
 *      에이전트가 사람의 버전 관리에 손대는 순간 신뢰를 잃는다.
 *      그래서 스냅숏은 세션 옆에 따로 둔다.
 *   ② **우리가 한 것만 되돌린다.** 되돌리기 직전 파일 해시를 확인해서, 사람이
 *      그 사이 손댄 파일은 건너뛰고 보고한다. 조용히 덮어쓰는 것이 최악이다.
 *   ③ **되돌리기 로그도 append-only 다.** 세션 JSONL 과 같은 성질 —
 *      되돌린 사실 자체가 기록으로 남고, 되돌리기를 되돌릴 수 있다.
 *
 * git 이 없는 프로젝트에서도 동작한다. git 이 있어도 쓰지 않는다.
 */

import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** 한 번의 파일 수정. before 가 null 이면 그 수정이 파일을 만들었다는 뜻. */
export interface FileChange {
  /** cwd 기준 상대 경로. */
  path: string;
  /** 수정 직전 내용의 해시. 파일이 없었으면 null. */
  beforeHash: string | null;
  /** 수정 직후 내용의 해시. */
  afterHash: string;
  /** 이 수정이 속한 세션 엔트리. 되돌릴 지점을 이걸로 지정한다. */
  entryId: string | null;
  timestamp: string;
}

export interface RestoreResult {
  restored: string[];
  /** 사람이 그 사이 손댄 파일. 덮어쓰지 않고 넘어간다. */
  skipped: { path: string; reason: string }[];
  /** 되돌리면서 지운 파일 (에이전트가 만들었던 것). */
  removed: string[];
}

/** 내용이 같으면 같은 이름. 같은 파일을 여러 번 저장하지 않는다. */
function hashOf(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

const MAX_SNAPSHOT_BYTES = 2_000_000;

export interface FileCheckpointsOptions {
  cwd: string;
  /** 스냅숏 저장 위치. 세션 파일 옆이 기본 — 세션을 지우면 같이 사라진다. */
  dir: string;
}

/** 로그 한 줄. 수정이거나, 되돌린 사실이거나. */
type LogLine =
  | ({ type: "change" } & FileChange)
  | { type: "rollback"; entryId: string | null; at: string };

export class FileCheckpoints {
  private readonly cwd: string;
  private readonly dir: string;
  private log: FileChange[] = [];

  constructor(options: FileCheckpointsOptions) {
    this.cwd = resolve(options.cwd);
    this.dir = options.dir;
    this.load();
  }

  private get logPath(): string {
    return join(this.dir, "log.jsonl");
  }

  /**
   * 디스크에서 되살린다.
   *
   * 로그가 메모리에만 있으면 `xcode --rollback` 은 **다음 프로세스에서 아무것도 못 한다** —
   * 블롭은 디스크에 있는데 무엇을 어디로 되돌릴지가 없다. 실제로 그 상태로 한 번 만들었다.
   *
   * 되돌리기 마커도 같은 파일에 남긴다. 잘라내지 않고 덧붙이므로 파일은 append-only 이고,
   * 읽을 때 마커를 적용해 유효한 로그를 계산한다.
   */
  private load(): void {
    if (!existsSync(this.logPath)) return;
    let changes: FileChange[] = [];
    for (const line of readFileSync(this.logPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: LogLine;
      try {
        parsed = JSON.parse(trimmed) as LogLine;
      } catch {
        continue; // 손상된 줄은 건너뛴다. 나머지는 여전히 유효하다.
      }
      if (parsed.type === "change") {
        const { type: _type, ...change } = parsed;
        changes.push(change);
      } else {
        changes = truncateAt(changes, parsed.entryId);
      }
    }
    this.log = changes;
  }

  private append(line: LogLine): void {
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(this.logPath, `${JSON.stringify(line)}\n`, "utf8");
  }

  get changes(): readonly FileChange[] {
    return this.log;
  }

  /** 지금 이 경로의 내용 해시. 없으면 null. */
  private currentHash(path: string): string | null {
    const full = join(this.cwd, path);
    if (!existsSync(full)) return null;
    try {
      if (statSync(full).isDirectory()) return null;
      return hashOf(readFileSync(full, "utf8"));
    } catch {
      return null;
    }
  }

  private blobPath(hash: string): string {
    return join(this.dir, hash);
  }

  private store(content: string): string {
    const hash = hashOf(content);
    const target = this.blobPath(hash);
    if (!existsSync(target)) {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(target, content, "utf8");
    }
    return hash;
  }

  /**
   * 수정 **직전** 상태를 잡아둔다. 파일이 없으면 null 을 돌려주고,
   * 그 null 이 나중에 "되돌릴 때 지워야 한다"는 뜻이 된다.
   */
  captureBefore(path: string): string | null {
    const full = join(this.cwd, path);
    if (!existsSync(full)) return null;
    try {
      if (statSync(full).size > MAX_SNAPSHOT_BYTES) return null;
      return this.store(readFileSync(full, "utf8"));
    } catch {
      return null;
    }
  }

  /** 수정이 끝난 뒤 기록한다. before 는 captureBefore 가 돌려준 값. */
  record(path: string, beforeHash: string | null, entryId: string | null): FileChange | null {
    const full = join(this.cwd, path);
    if (!existsSync(full)) return null;
    let afterHash: string;
    try {
      if (statSync(full).size > MAX_SNAPSHOT_BYTES) return null;
      afterHash = this.store(readFileSync(full, "utf8"));
    } catch {
      return null;
    }
    // 내용이 그대로면 기록하지 않는다 — 되돌릴 것이 없다.
    if (beforeHash === afterHash) return null;

    const change: FileChange = {
      path,
      beforeHash,
      afterHash,
      entryId,
      timestamp: new Date().toISOString(),
    };
    this.log.push(change);
    this.append({ type: "change", ...change });
    return change;
  }

  /**
   * 지정한 엔트리 **이후**의 수정을 되돌린다. entryId 가 없으면 전부.
   *
   * 역순으로 걷는다 — 같은 파일이 여러 번 고쳐졌으면 가장 오래된 before 로 가야 한다.
   * 되돌리기 직전 현재 해시를 확인해서, 우리가 남긴 after 와 다르면 **건너뛴다.**
   * 사람이 그 사이 손댄 파일이라는 뜻이고, 그건 우리가 되돌릴 것이 아니다.
   */
  restoreTo(entryId?: string | null): RestoreResult {
    const cut = entryId ? lastIndexOfEntry(this.log, entryId) : -1;
    // 지정한 엔트리 자체는 유지하고 그 뒤만 되돌린다.
    const target = cut === -1 ? this.log : this.log.slice(cut + 1);

    const result: RestoreResult = { restored: [], skipped: [], removed: [] };

    /*
     * 파일마다 **처음** 수정의 before 로 간다. 마지막 수정의 before 로 가면
     * 한 단계만 되돌아간다 (a.txt 를 두 번 고쳤으면 "고침1" 에서 멈춘다).
     * 반면 변조 검사는 **마지막** 수정의 after 와 비교해야 한다 — 그게 우리가
     * 남긴 마지막 상태이기 때문이다. 그래서 처음과 마지막을 따로 모은다.
     */
    const firstChange = new Map<string, FileChange>();
    const lastChange = new Map<string, FileChange>();
    for (const change of target) {
      if (!firstChange.has(change.path)) firstChange.set(change.path, change);
      lastChange.set(change.path, change);
    }

    for (const [path, first] of firstChange) {
      const expected = (lastChange.get(path) as FileChange).afterHash;
      const now = this.currentHash(path);
      if (now !== null && now !== expected) {
        result.skipped.push({ path, reason: "에이전트 수정 이후 파일이 또 바뀌었다" });
        continue;
      }

      const full = join(this.cwd, path);
      if (first.beforeHash === null) {
        // 이 수정이 파일을 만들었다 — 되돌리기는 삭제다.
        if (existsSync(full)) {
          rmSync(full, { force: true });
          result.removed.push(path);
        }
        continue;
      }

      const blob = this.blobPath(first.beforeHash);
      if (!existsSync(blob)) {
        result.skipped.push({ path, reason: "스냅숏이 없다" });
        continue;
      }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, readFileSync(blob, "utf8"), "utf8");
      result.restored.push(path);
    }

    // 되돌린 구간은 유효 로그에서 떼어낸다 — 두 번 되돌리는 일이 없게.
    // 파일은 자르지 않는다. 마커를 덧붙이고, 읽을 때 적용한다.
    this.log = truncateAt(this.log, entryId ?? null);
    if (target.length > 0) {
      this.append({ type: "rollback", entryId: entryId ?? null, at: new Date().toISOString() });
    }

    return result;
  }

  /** 이번 세션에서 우리가 건드린 파일들. 브리핑과 롤백 미리보기가 쓴다. */
  touchedPaths(): string[] {
    return [...new Set(this.log.map((c) => c.path))];
  }
}

/** 되돌리기 마커를 적용한 결과. 지정 엔트리까지만 남는다. */
function truncateAt(changes: FileChange[], entryId: string | null): FileChange[] {
  if (!entryId) return [];
  const cut = lastIndexOfEntry(changes, entryId);
  return cut === -1 ? changes : changes.slice(0, cut + 1);
}

/**
 * 같은 엔트리에서 여러 파일을 고칠 수 있으므로 **마지막** 것을 찾는다.
 * 처음 것을 찾으면 같은 턴의 나머지 수정까지 되돌아간다.
 */
function lastIndexOfEntry(changes: readonly FileChange[], entryId: string): number {
  for (let i = changes.length - 1; i >= 0; i--) {
    if ((changes[i] as FileChange).entryId === entryId) return i;
  }
  return -1;
}

/**
 * 파일을 고치는 툴을 감싸 수정 전후를 기록한다.
 *
 * 스크러빙과 같은 자리다 — **툴 경계**. 이벤트 구독자로 하면 어떤 에이전트는
 * 그 구독자를 갖지 않고, 그러면 그 에이전트의 수정은 되돌릴 수 없다.
 */
export function checkpointTools<T extends { name: string; execute: (...args: never[]) => unknown }>(
  tools: T[],
  checkpoints: FileCheckpoints,
  currentEntryId: () => string | null,
): T[] {
  const MUTATING = new Set(["write", "edit"]);
  return tools.map((tool) => {
    if (!MUTATING.has(tool.name)) return tool;
    return {
      ...tool,
      async execute(args: { path?: unknown }, context: unknown) {
        const path = typeof args?.path === "string" ? args.path : null;
        const before = path ? checkpoints.captureBefore(path) : null;
        const result = await (tool.execute as (a: unknown, c: unknown) => Promise<unknown>)(
          args,
          context,
        );
        const details = (result as { details?: { path?: unknown } }).details;
        const written = typeof details?.path === "string" ? details.path : path;
        if (written) checkpoints.record(written, before, currentEntryId());
        return result;
      },
    } as T;
  });
}

export function relativeToCwd(cwd: string, path: string): string {
  return relative(resolve(cwd), resolve(cwd, path));
}
