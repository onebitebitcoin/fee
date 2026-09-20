"""국내 거래소 입금 정책 레지스트리 단위 테스트.

이 레지스트리는 '수수료로는 드러나지 않는 제약'을 다룬다. 값이 틀리면 실행할 수 없는 경로를
실행 가능한 것처럼 보여주게 되므로, 조사로 확인한 내용과 확인하지 못한 내용의 경계를
테스트로 고정한다.
"""
import pytest

from backend.app.domain.korea_deposit_policy import (
    PERSONAL_WALLET_POLICIES,
    USDT_DEPOSIT_NETWORK_POLICIES,
    VASP_DEPOSIT_POLICIES,
    personal_wallet_gate,
    third_party_deposit_gate,
    usdt_deposit_network_gate,
    vasp_gate,
)
from backend.app.domain.path_helpers import normalize_usdt_network

KOREA_EXCHANGES = ('upbit', 'bithumb', 'coinone', 'korbit', 'gopax')
OVER_THRESHOLD = 5_500_000
UNDER_THRESHOLD = 500_000


class TestPersonalWalletGate:
    @pytest.mark.parametrize('exchange', KOREA_EXCHANGES)
    def test_기준_금액_미만이면_관문이_없다(self, exchange):
        # 다섯 곳 모두 100만원 미만 입금은 별도 검증 없이 받는다.
        assert personal_wallet_gate(exchange, UNDER_THRESHOLD) is None

    @pytest.mark.parametrize('exchange', KOREA_EXCHANGES)
    def test_기준_금액_이상이면_관문이_생긴다(self, exchange):
        gate = personal_wallet_gate(exchange, OVER_THRESHOLD)
        assert gate is not None
        assert gate['kind'] == 'personal_wallet'

    def test_업비트는_등록_가능_지갑에_비트코인_지갑이_없어_blocked_다(self):
        # 메타마스크·카이아·팬텀·폴카닷·케플러는 모두 비트코인 온체인 주소를 만들지 못한다.
        gate = personal_wallet_gate('upbit', OVER_THRESHOLD)
        assert gate['level'] == 'blocked'
        assert PERSONAL_WALLET_POLICIES['upbit'].bitcoin_capable_wallets == ()

    @pytest.mark.parametrize('exchange', ('bithumb', 'coinone', 'korbit', 'gopax'))
    def test_나머지_네_곳은_등록하면_가능할_수_있어_required_다(self, exchange):
        # 트러스트월렛·렛저 나노·디센트·삼성 블록체인 월렛처럼 비트코인을 담는 지갑이 목록에 있다.
        gate = personal_wallet_gate(exchange, OVER_THRESHOLD)
        assert gate['level'] == 'required'
        assert PERSONAL_WALLET_POLICIES[exchange].bitcoin_capable_wallets

    def test_required_안내는_비트코인_네트워크_확인이_필요함을_밝힌다(self):
        # 거래소가 렛저를 등록받는다고 해서 그 지갑의 BTC 주소까지 받는다는 보장은 없다.
        gate = personal_wallet_gate('korbit', OVER_THRESHOLD)
        assert '비트코인 네트워크 주소까지 등록받는지는 확인하지 못했' in gate['desc']

    def test_비트코인_지갑_목록은_전체_목록의_부분집합이다(self):
        for exchange, policy in PERSONAL_WALLET_POLICIES.items():
            assert set(policy.bitcoin_capable_wallets) <= set(policy.registrable_wallets), exchange

    def test_레지스트리에_없는_거래소는_unknown_으로_답한다(self):
        assert personal_wallet_gate('nonexistent', OVER_THRESHOLD)['level'] == 'unknown'

    def test_모든_국내_거래소에_정책이_있다(self):
        assert set(PERSONAL_WALLET_POLICIES) == set(KOREA_EXCHANGES)

    def test_근거_없는_정책은_없다(self):
        for exchange, policy in PERSONAL_WALLET_POLICIES.items():
            assert policy.source, exchange
            assert policy.source_url.startswith('https://'), exchange
            assert policy.registrable_wallets, exchange


class TestVaspGate:
    @pytest.mark.parametrize('exchange', KOREA_EXCHANGES)
    def test_기준_금액_미만이면_목록과_무관하게_통과한다(self, exchange):
        # 목록에 없는 거래소(멕스씨)라도 100만원 미만이면 입금 자체는 막히지 않는다.
        assert vasp_gate(exchange, 'mexc', UNDER_THRESHOLD) is None

    @pytest.mark.parametrize('exchange', KOREA_EXCHANGES)
    def test_바이낸스는_다섯_곳_모두_자동_입금이다(self, exchange):
        # 업비트는 입출금 리스트, 나머지는 트래블룰 솔루션이나 본인 계정 확인으로 연동돼 있다.
        assert vasp_gate(exchange, 'binance', OVER_THRESHOLD) is None

    @pytest.mark.parametrize('exchange', KOREA_EXCHANGES)
    @pytest.mark.parametrize('global_exchange', ('okx', 'bitget'))
    def test_OKX_와_비트겟도_다섯_곳_모두_자동_입금이다(self, exchange, global_exchange):
        assert vasp_gate(exchange, global_exchange, OVER_THRESHOLD) is None

    def test_업비트의_계정주_확인_연동_다섯_곳은_자동_입금이다(self):
        for g in ('binance', 'okx', 'bybit', 'bitget', 'gate'):
            assert vasp_gate('upbit', g, OVER_THRESHOLD) is None, g

    @pytest.mark.parametrize('global_exchange', ('kraken', 'coinbase'))
    def test_업비트도_크라켄_코인베이스는_증빙_심사_대상이다(self, global_exchange):
        # 업비트 VASP 리스트에서 이 둘은 '위험평가 통과 해외 가상자산사업자' 등급이고,
        # 입금 방식이 '수동 입금 반영(입금 출처 증빙 승인 후 반영)'으로 명시돼 있다.
        # '입금만 지원되니 자동 반영'으로 본 이전 판단이 틀렸다.
        assert vasp_gate('upbit', global_exchange, OVER_THRESHOLD)['level'] == 'review'

    def test_네_거래소_모두_크라켄_코인베이스를_심사_대상으로_둔다(self):
        # 고팍스만 이 둘을 목록에 두지 않아 blocked 다. 나머지 넷은 판정이 같아야 한다.
        for exchange in ('upbit', 'bithumb', 'coinone', 'korbit'):
            for g in ('kraken', 'coinbase'):
                assert VASP_DEPOSIT_POLICIES[exchange].review_required >= {g}, (exchange, g)

    def test_빗썸은_게이트를_목록에_두지_않아_blocked_다(self):
        # 2026-04-30 기준 빗썸 입출금 가능 목록 어디에도 Gate 가 없다.
        gate = vasp_gate('bithumb', 'gate', OVER_THRESHOLD)
        assert gate['level'] == 'blocked'
        assert gate['kind'] == 'vasp'

    def test_고팍스는_바이비트를_목록에_두지_않아_blocked_다(self):
        assert vasp_gate('gopax', 'bybit', OVER_THRESHOLD)['level'] == 'blocked'

    @pytest.mark.parametrize('exchange', ('bithumb', 'coinone', 'korbit'))
    @pytest.mark.parametrize('global_exchange', ('kraken', 'coinbase'))
    def test_화이트리스트_구분_거래소는_증빙_심사_대상이다(self, exchange, global_exchange):
        # 트래블룰 연동이 아니라 지갑 주소 등록 대상이라 입금 시 증빙을 거친다.
        gate = vasp_gate(exchange, global_exchange, OVER_THRESHOLD)
        assert gate['level'] == 'review'

    def test_고팍스는_크라켄_코인베이스를_목록에_두지_않아_blocked_다(self):
        for g in ('kraken', 'coinbase'):
            assert vasp_gate('gopax', g, OVER_THRESHOLD)['level'] == 'blocked', g

    def test_레지스트리에_없는_거래소는_unknown_으로_답한다(self):
        assert vasp_gate('nonexistent', 'binance', OVER_THRESHOLD)['level'] == 'unknown'

    def test_자동_입금과_심사_대상은_겹치지_않는다(self):
        for exchange, policy in VASP_DEPOSIT_POLICIES.items():
            assert not (policy.auto_deposit & policy.review_required), exchange

    def test_모든_국내_거래소에_정책과_근거가_있다(self):
        assert set(VASP_DEPOSIT_POLICIES) == set(KOREA_EXCHANGES)
        for exchange, policy in VASP_DEPOSIT_POLICIES.items():
            assert policy.auto_deposit, exchange
            assert policy.source, exchange
            assert policy.source_url.startswith('https://'), exchange


class TestUsdtDepositNetworkGate:
    """국내 거래소가 어느 체인으로 USDT 입금을 받는지 판정한다.

    해외 거래소가 그 네트워크로 출금할 수 있다는 사실은 국내 거래소가 그 네트워크로
    입금을 받는다는 뜻이 아니다. 둘을 구분하지 않으면 실행할 수 없는 경로를 추천하게 된다.
    """

    @pytest.mark.parametrize('exchange,label', [
        ('bithumb', 'Tron (TRC20)'),
        ('bithumb', 'Ethereum (ERC20)'),
        ('bithumb', 'Kaia'),
        ('bithumb', 'Aptos'),
        ('upbit', 'Tron (TRC20)'),
        ('upbit', 'Ethereum (ERC20)'),
        ('korbit', 'Tron (TRC20)'),
        ('korbit', 'Ethereum (ERC20)'),
        ('coinone', 'Tron (TRC20)'),
        ('gopax', 'Tron (TRC20)'),
    ])
    def test_확인된_입금망은_관문이_없다(self, exchange, label):
        assert usdt_deposit_network_gate(exchange, label) is None

    @pytest.mark.parametrize('label', ('Berachain (USDT0)', 'Plasma', 'BNB Smart Chain (BEP20)'))
    def test_빗썸이_받지_않는_체인은_blocked_다(self, label):
        # 빗썸 멀티체인 API 전수 조회에 BERA·XPL·BSC 가 없다.
        gate = usdt_deposit_network_gate('bithumb', label)
        assert gate is not None
        assert gate['kind'] == 'usdt_deposit_network'
        assert gate['level'] == 'blocked'

    @pytest.mark.parametrize('exchange', ('upbit', 'bithumb', 'coinone', 'korbit'))
    @pytest.mark.parametrize('label', ('Berachain (USDT0)', 'Plasma', 'BNB Smart Chain (BEP20)'))
    def test_전수_출처가_있는_거래소는_목록_밖을_blocked_로_단정한다(self, exchange, label):
        # 업비트는 공지 누적이라 전수가 아니지만, 세 체인은 어느 공지에도 없어 unknown 으로 남는다.
        level = usdt_deposit_network_gate(exchange, label)['level']
        expected = 'blocked' if USDT_DEPOSIT_NETWORK_POLICIES[exchange].exhaustive else 'unknown'
        assert level == expected

    def test_고팍스는_트론_외에는_확인하지_못해_unknown_이다(self):
        # 고팍스 자산 API 는 자산당 네트워크를 하나만 표현해 전수 열거로 볼 수 없다.
        gate = usdt_deposit_network_gate('gopax', 'Ethereum (ERC20)')
        assert gate['level'] == 'unknown'
        assert USDT_DEPOSIT_NETWORK_POLICIES['gopax'].exhaustive is False

    def test_안내_문구는_받아주는_망을_알려준다(self):
        # 막혔다는 사실만으로는 대신 무엇을 써야 할지 알 수 없다.
        gate = usdt_deposit_network_gate('bithumb', 'Plasma')
        assert 'Tron' in gate['desc']
        assert USDT_DEPOSIT_NETWORK_POLICIES['bithumb'].checked_on in gate['desc']

    def test_같은_망의_라벨_변형은_모두_통과한다(self):
        # 거래소마다 같은 체인을 다르게 표기한다. 정규화를 거치므로 표기 차이는 판정에 영향이 없다.
        for label in ('Tron (TRC20)', 'TRC20', 'Tron', 'tron (trc20)'):
            assert usdt_deposit_network_gate('coinone', label) is None, label

    def test_레지스트리에_없는_거래소는_unknown_으로_답한다(self):
        assert usdt_deposit_network_gate('nonexistent', 'Tron (TRC20)')['level'] == 'unknown'

    def test_허용_목록의_키는_정규화_함수의_출력값이다(self):
        # 정규화 키에 오타가 있으면 실제로 쓸 수 있는 망이 조용히 막힌다.
        for exchange, policy in USDT_DEPOSIT_NETWORK_POLICIES.items():
            for key in policy.supported:
                assert normalize_usdt_network(key) == key, f'{exchange}: {key}'

    def test_모든_국내_거래소에_정책과_근거가_있다(self):
        assert set(USDT_DEPOSIT_NETWORK_POLICIES) == set(KOREA_EXCHANGES)
        for exchange, policy in USDT_DEPOSIT_NETWORK_POLICIES.items():
            assert policy.supported, exchange
            assert policy.source, exchange
            assert policy.source_url.startswith('https://'), exchange
            assert policy.checked_on, exchange


class TestThirdPartyGate:
    def test_스왑_서비스_송금은_unknown_이다(self):
        # 국내 거래소 입금 규정은 송신인이 회원 본인임을 전제로 쓰여 있어,
        # 제3자인 스왑 서비스가 보내는 형태를 어떻게 처리하는지 확인하지 못했다.
        gate = third_party_deposit_gate('upbit')
        assert gate['kind'] == 'third_party'
        assert gate['level'] == 'unknown'
