import argparse
import time

from backend.app.core.config import get_settings
from backend.app.db.bootstrap import init_db
from backend.app.db.session import SessionLocal
from backend.app.services.crawl_service import CrawlService


def run_once(trigger: str = 'scheduler') -> None:
    with SessionLocal() as db:
        CrawlService(db).run_full_crawl(trigger=trigger)


def main() -> None:
    parser = argparse.ArgumentParser(description='Exchange Fee crawler worker')
    parser.add_argument('command', choices=['run-once', 'serve'], nargs='?', default='serve')
    args = parser.parse_args()
    settings = get_settings()
    init_db()
    if args.command == 'run-once':
        run_once(trigger='manual')
        return
    while True:
        run_once(trigger='scheduler')
        time.sleep(settings.crawl_interval_minutes * 60)


if __name__ == '__main__':
    main()
