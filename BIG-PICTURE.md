<!-- open-steps:begin -->
# LazyZ 현재 지도

기능 분석 기준: 2026-10-17 · 검증 갱신: 2026-10-18 · 0.11.0. 사용자가 실제로 운영한 서비스와
소스에 구현된 기능을 구분한다. [상세 보고서](docs/reports/2026-10-17-feature-evolution.md).

| 기능 | 현재 단계 | 근거 | 남은 것 |
| --- | --- | --- | --- |
| 프로젝트 맥락·계획 | 소스 구현 | init-deep, ulw-plan | 계획 품질의 실제 업무 평가 |
| 승인 후 실행 | 로컬 검증 | ulw-execute, executor verifier, 통일된 start-work | 실제 호스트 실행 확인 |
| 작업별 예산·증거 | 소스 구현 | task-state, structured-receipt | 내부 API 전체 계량, 신뢰 실행 증거 |
| 재개·완료 상태 | 제한적 구현 | work-status, continuation, ulw-loop | 압축 후 보장·상태 통합 |
| 코드 탐색·검토 | 소스/선언 존재 | LSP, AST-grep, CodeGraph, 전문 스킬 | 실제 호스트/외부 도구 연결 |
| 공개 저장소 준비 | 소스 게시·CI 통과 | 8f875db, 1,391 테스트, Linux/macOS × Node 20/22 네 조합 성공 | 실제 호스트 운영·별도 release 발행은 미검증 |
| 웹 홈페이지·호스팅 | 제공하지 않음 | GitHub Pages 비활성 조회 | 별도 요청이 있을 때 범위 결정 |

흐름: 요청 → 프로젝트 맥락 → 계획 → 사람 승인 → 예산 내 실행 → 증거 → 사람 검토.

현재 파일 영역은 plugin, 현재 docs, 과거 waterfall, 유지보수 scripts, GitHub CI로
구분한다. 설치 경로는 `plugins/lazyz`다. Xcode와 개인 작업 파일은 포함하지 않는다.

작업 전 Git 이력 census: 95일 된 저장소, docs/plugins는 7월 20일,
marketplace는 7월 14일이 마지막 커밋 시점이다. 모두 연결된 영역으로 분류됐다.
이 날짜는 미커밋 현재 파일의 수정 날짜가 아니다. 6개월 이력이 쌓이는
2027-01-10 전에는 활동 신호가 얕으며, 오래됐다는 이유만으로 삭제하지 않는다.

검증: 10월 18일 로컬 빌드·테스트와 원격 CI 네 조합 성공 결과를 [보고서](reports/ai-review/2026-10-18-build-test-publication.html)에 기록했다.
실제 ZCode 운영, 별도 GitHub Release 발행, 비용·속도 개선은 확인되지 않았다.
OmO 전용 전체 설치 테스트는 LazyZ 제품 검증과 구분한다.
<!-- open-steps:end -->
