import json
from urllib.error import URLError

import pytest

from backend.app.db.base import Base
from backend.app.db.models import CrawlRun, WithdrawalFeeSnapshot
from backend.app.services import withdrawal_alert
from tests.test_crawl_service import make_test_session


@pytest.fixture
def db():
    engine, Session = make_test_session()
    with Session() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def telegram(mocker):
    mocker.patch.object(withdrawal_alert, 'get_settings', return_value=mocker.Mock(
        telegram_bot_token='test-token', telegram_chat_id='42'))
    return mocker.patch.object(withdrawal_alert, 'urlopen')


def add_run(db, status, rows):
    run = CrawlRun(trigger='scheduled', status=status)
    db.add(run)
    db.flush()
    for exchange, coin, label, enabled, reason in rows:
        db.add(WithdrawalFeeSnapshot(
            crawl_run_id=run.id, exchange=exchange, coin=coin, source='realtime_api',
            network_label=label, enabled=enabled, suspension_reason=reason,
        ))
    db.flush()
    return run


def sent_texts(urlopen):
    return [json.loads(call.args[0].data)['text'] for call in urlopen.call_args_list]


def test_suspended_and_resumed_networks_go_out_in_one_message(db, telegram):
    add_run(db, 'partial_success', [
        ('binance', 'USDT', 'Solana', True, None),
        ('bithumb', 'USDT', 'Aptos', False, 'System Maintenance'),
        ('upbit', 'BTC', 'Bitcoin', True, None),
    ])
    run = add_run(db, 'running', [
        ('binance', 'USDT', 'Solana', False, 'System Maintenance'),
        ('bithumb', 'USDT', 'Aptos', True, None),
        ('upbit', 'BTC', 'Bitcoin', True, None),
    ])

    withdrawal_alert.notify_withdrawal_changes(db, run.id)

    assert sent_texts(telegram) == [(
        '[출금 상태 변경]\n'
        '중단 1건\n'
        '• binance USDT Solana (System Maintenance)\n'
        '재개 1건\n'
        '• bithumb USDT Aptos'
    )]
    request = telegram.call_args.args[0]
    assert request.full_url == 'https://api.telegram.org/bottest-token/sendMessage'
    assert json.loads(request.data)['chat_id'] == '42'


def test_network_missing_from_one_run_is_not_reported(db, telegram):
    add_run(db, 'success', [('binance', 'BTC', 'Bitcoin', False, None)])
    run = add_run(db, 'running', [('upbit', 'BTC', 'Bitcoin', False, None)])

    withdrawal_alert.notify_withdrawal_changes(db, run.id)

    telegram.assert_not_called()


def test_compares_with_last_successful_run_only(db, telegram):
    add_run(db, 'success', [('binance', 'BTC', 'Bitcoin', False, None)])
    add_run(db, 'failed', [('binance', 'BTC', 'Bitcoin', True, None)])
    run = add_run(db, 'running', [('binance', 'BTC', 'Bitcoin', False, None)])

    withdrawal_alert.notify_withdrawal_changes(db, run.id)

    telegram.assert_not_called()


def test_first_run_and_missing_settings_send_nothing(db, telegram, mocker):
    run = add_run(db, 'running', [('binance', 'BTC', 'Bitcoin', False, None)])
    withdrawal_alert.notify_withdrawal_changes(db, run.id)
    telegram.assert_not_called()

    add_run(db, 'success', [('binance', 'BTC', 'Bitcoin', True, None)])
    run = add_run(db, 'running', [('binance', 'BTC', 'Bitcoin', False, None)])
    mocker.patch.object(withdrawal_alert, 'get_settings', return_value=mocker.Mock(
        telegram_bot_token='', telegram_chat_id='42'))
    withdrawal_alert.notify_withdrawal_changes(db, run.id)
    telegram.assert_not_called()


def test_send_failure_is_logged_without_token(db, telegram, caplog):
    telegram.side_effect = URLError('down')
    add_run(db, 'success', [('binance', 'BTC', 'Bitcoin', True, None)])
    run = add_run(db, 'running', [('binance', 'BTC', 'Bitcoin', False, None)])

    withdrawal_alert.notify_withdrawal_changes(db, run.id)

    assert '출금 상태 알림 실패' in caplog.text
    assert 'test-token' not in caplog.text


def test_full_crawl_sends_alert_and_survives_alert_error(mocker):
    import backend.app.services.crawl_service as cs_mod

    engine, Session = make_test_session()
    mocker.patch.object(cs_mod, 'ALL_EXCHANGES', ['upbit'])
    mocker.patch.object(cs_mod, 'fetch_usd_krw_rate', return_value=1400.0)
    mocker.patch.object(cs_mod, 'get_ticker', return_value={'error': 'down'})
    mocker.patch.object(cs_mod, 'get_withdrawal_fees', return_value={'error': 'down'})
    mocker.patch.object(cs_mod, 'get_network_status', return_value={'exchanges': {}})
    notify = mocker.patch.object(cs_mod, 'notify_withdrawal_changes', side_effect=RuntimeError('boom'))

    with Session() as session:
        result = cs_mod.CrawlService(session).run_full_crawl(trigger='scheduled')
        assert result.status == 'partial_success'
        notify.assert_called_once_with(session, result.id)
    Base.metadata.drop_all(bind=engine)
