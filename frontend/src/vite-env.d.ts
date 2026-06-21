/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// 대용량 fixture JSON을 resolveJsonModule 타입추론 없이 import (테스트에서 구체 타입으로 캐스팅)
declare module '*.json' {
  const value: unknown;
  export default value;
}
