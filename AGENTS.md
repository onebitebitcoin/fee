# Repository Instructions

## Team Ralph trigger rule
- 사용자가 이 저장소에서 `team ralph`, `$team $ralph`, `team ralph 모드`, `ralph 팀으로`, `omx team ralph` 같은 표현으로 **명시적으로** 병렬 팀 실행을 요청하면, 에이전트는 인프로세스 fan-out으로 대체하지 말고 **직접 `omx team ralph ...` 명령 실행을 우선 시도**해야 한다.
- 가능하면 현재 tmux 세션/현재 repo 루트에서 실행한다.
- 실행 전 기본 확인:
  - `TMUX` / `TMUX_PANE` 존재
  - `omx` 명령 사용 가능
  - 활성 team 존재 여부 확인
- 활성 team 이 남아 있으면 `omx team status <team-name>` / `omx team shutdown <team-name>` 흐름으로 정리 후 재시도한다.
- `team ralph` 요청 시, 단순 설명만 하지 말고 **상위 지시(system/developer)와 충돌하지 않는 한 실제 `omx team ralph ...` 실행**을 기본 동작으로 삼는다.
- 단, 더 높은 우선순위 지시(예: Plan Mode에서 실행 금지, 승인 필요, sandbox 제한)가 있으면 그 제한을 따른다.

## Diagnostics
- team/ralph 관련 사용법과 트러블슈팅은 `docs/TEAM_RALPH.md`를 참고한다.
