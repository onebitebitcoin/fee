from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]
FRONTEND_DIST_DIR = ROOT_DIR / 'frontend' / 'dist'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'exchange-fee'
    api_v1_prefix: str = '/api/v1'
    environment: Literal['development', 'test', 'production'] = 'development'
    database_url: str = f'sqlite:///{ROOT_DIR}/exchange_fee.db'

    @field_validator('database_url', mode='before')
    @classmethod
    def fix_postgres_scheme(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith('postgres://'):
            return v.replace('postgres://', 'postgresql://', 1)
        return v
    port: int = 8000
    cors_origins: str = '*'
    crawl_interval_minutes: int = 60
    manual_crawl_enabled: bool = True
    admin_api_key: str = 'dev-secret-key'  # 프로덕션에서는 환경 변수로 오버라이드 필요
    frontend_dist_dir: Path = Field(default=FRONTEND_DIST_DIR)
    playground_service_nodes_url: str = 'https://playground.onebitebitcoin.com/api/service-nodes/admin?username=guest'

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == '*':
            return ['*']
        return [item.strip() for item in self.cors_origins.split(',') if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
