<!-- open-steps:begin -->
# LazyZ 개발 작업 공간 지도

기준: 2026-10-17. 현재 제품 기능과 초기 비교는
[공개용 상세 보고서](../lazyz-github/docs/reports/2026-10-17-feature-evolution.md),
작업 결과는 [HTML 보고서](reports/ai-review/2026-10-17-feature-evolution-publication.html).

| 영역 | 역할 | 현재 판단 |
| --- | --- | --- |
| plugins/lazyz | ZCode 플러그인 0.11.0의 소스·빌드 입력·prebuilt | 공개용 동기화의 유일한 제품 소스 |
| xcode | 별도 CLI 제품 | 이번 분석/배포 구조 정리에서 수정·내보내기 제외 |
| root 복구용 패키지·third-party | upstream 작업/복구 맥락 | 공개 plugin은 자체 vendor를 사용; root 전체 복사 금지 |
| docs·reports | 설계·날짜별 분석·실행 증거 | 현재 기능과 과거 결과를 구분 |
| .omo·.zcode·.gjc·개인 문서 | 로컬 작업 상태와 사용자 자료 | 공개하지 않음 |
| ../lazyz-github | 공개 저장소용 checkout | plugin 설치 경로 유지, 별도 current docs/governance |

제품 흐름: 요청 → 맥락 → 계획 → 승인 → 작업 예산 → 실행 → 증거 → 재개/완료.
13개 역할·29개 스킬·20개 훅·6개 MCP는 소스 집계다. 실제 호스트 동작을
전부 확인했다는 뜻은 아니다. 상태는 Boulder/ledger와 versioned goals로 분리되어
있으며 `/start-work`의 이전 안내가 남아 있다.

개발 HEAD는 7월 30일이며 미커밋 변경이 많다. 파일 해시 snapshot을 함께 보아야
현재 코드를 식별할 수 있다. Git census상 저장소는 104일, 연결된 plugin/docs는
7월 20일, Xcode는 7월 30일 기록이다. 이는 현재 파일 변경일이 아니다.
2027-01-01까지 활동 신호가 얕으므로 이력만으로 영역을 폐기하지 않는다.

이번에는 제품 폴더를 물리적으로 옮기지 않았다. 설치 계약을 유지하면서 공개
경계를 문서/동기화 도구로 분리했다. 실제 ZCode·배포·비용/성능 개선은 미검증이다.
<!-- open-steps:end -->
