# 구현 진행 상황 — 게시판 기능

## 결정 사항
- 카테고리: 일반(general) / 제보(report) / 공지(notice) 3종
- 검색: 제목 + 내용
- 공지: 모든 페이지 상단 고정, 색상 구분(amber). 제보는 blue 톤 구분
- 제보하기 링크(추천/결과): `/board/new?template=report` + 경로 요약 자동첨부
- 공지 작성/관리: 기존 `/admin` 페이지 별도 탭에서 X-API-Key로 처리 (글쓰기 화면엔 공지 토글 없음)
- 비밀번호: hashlib.pbkdf2_hmac + salt (의존성 추가 없음)
- 페이지당 20개

## 완료된 Phase
- [x] Phase 1: Backend 모델/마이그레이션/비번 유틸 (BoardPost/BoardComment, 3b54494a63c3, security.py)
- [x] Phase 2: Backend API(board.py)+board_repository.py+라우터 등록+pytest 10/10

## 현재 진행 중
- [ ] Phase 3: Frontend 타입/api + 게시판 3페이지(목록/상세/작성) + 라우팅

## 남은 Phase
- [ ] Phase 4: 진입 링크(헤더) + 제보하기 링크(추천/결과) + AdminPage 공지 탭 + vitest
- [ ] Phase 5: 전체 검증(lint/test/build) + INDEX.md 동기화 + 최종 커밋
