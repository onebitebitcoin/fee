import { defineConfig } from 'vitest/config';

// 순수 함수 단위 테스트만 — DOM 불필요(node 환경), test 파일은 src/**/*.test.ts
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
