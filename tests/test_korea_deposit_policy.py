"""국내 거래소 입금 정책 레지스트리 단위 테스트.

이 레지스트리는 '수수료로는 드러나지 않는 제약'을 다룬다. 값이 틀리면 실행할 수 없는 경로를
실행 가능한 것처럼 보여주게 되므로, 조사로 확인한 내용과 확인하지 못한 내용의 경계를
테스트로 고정한다.
"""
from backend.app.domain.korea_deposit_policy import (
    PERSONAL_WALLET_POLICIES,
    VASP_DEPOSIT_POLICIES,
    personal_wallet_gate,
    third_party_deposit_gate,
    vasp_gate,
)


class TestPersonalWalletGate:
    def test_기준_금액_미만이면_관문이_없다(self):
        # 업비트는 100만원 미만 입금을 별도 검증 없이 받는다.
        assert personal_wallet_gate('upbit', 500_000) is None

    def test_기준_금액_이상이면_관문이_생긴다(self):
        gate = personal_wallet_gate('upbit', 1_000_000)
        assert gate is not None
        assert gate['kind'] == 'personal_wallet'

    def test_비트코인_지갑을_등록할_수_없는_거래소는_blocked_다(self):
        # 업비트가 등록을 받는 개인지갑은 모두 EVM·알트체인 계열이라
        # 개인 지갑의 BTC 를 곧장 보내는 경로는 절차를 밟아도 뚫리지 않는다.
        gate = personal_wallet_gate('upbit', 5_500_000)
        assert gate['level'] == 'blocked'
        assert '메타마스크' in gate['desc']
        assert gate['source_url'].startswith('https://')

    def test_빗썸은_금액과_무관하게_관문이_걸린다(self):
        # 2024-01-01 부터 모든 입금이 신청 대상이라 기준 금액이 없다.
        assert PERSONAL_WALLET_POLICIES['bithumb'].threshold_krw is None
        assert personal_wallet_gate('bithumb', 10_000)['level'] == 'blocked'

    def test_확인하지_못한_거래소는_unknown_으로_남는다(self):
        # 코인원·코빗·고팍스는 비트코인 지갑 등록 가능 여부를 확인하지 못했다.
        for exchange in ('coinone', 'korbit', 'gopax'):
            gate = personal_wallet_gate(exchange, 5_500_000)
            assert gate['level'] == 'unknown', exchange

    def test_레지스트리에_없는_거래소도_unknown_으로_답한다(self):
        gate = personal_wallet_gate('nonexistent', 5_500_000)
        assert gate['level'] == 'unknown'

    def test_모든_국내_거래소에_정책이_있다(self):
        assert set(PERSONAL_WALLET_POLICIES) == {'upbit', 'bithumb', 'coinone', 'korbit', 'gopax'}

    def test_근거_없는_정책은_없다(self):
        for exchange, policy in PERSONAL_WALLET_POLICIES.items():
            assert policy.source, exchange
            assert policy.source_url.startswith('https://'), exchange


class TestVaspGate:
    def test_입금_허용_목록에_있으면_관문이_없다(self):
        # 업비트 공식 리스트에 바이낸스가 입금/출금 모두 지원으로 올라 있다.
        assert vasp_gate('upbit', 'binance') is None

    def test_입금만_지원하는_거래소도_매도_방향에서는_통과한다(self):
        # 코인베이스·크라켄은 업비트로 '입금만' 지원한다. 파는 방향은 입금이라 문제되지 않는다.
        assert vasp_gate('upbit', 'coinbase') is None
        assert vasp_gate('upbit', 'kraken') is None

    def test_목록에_없는_거래소는_blocked_다(self):
        gate = vasp_gate('upbit', 'mexc')
        assert gate['level'] == 'blocked'
        assert gate['kind'] == 'vasp'

    def test_공식_목록을_확보하지_못한_거래소는_unknown_이다(self):
        # 허용으로 가정하면 막히는 경로를 뚫린 것처럼 보여주게 된다.
        for exchange in ('bithumb', 'coinone', 'korbit', 'gopax'):
            assert VASP_DEPOSIT_POLICIES[exchange].deposit_allowed is None, exchange
            assert vasp_gate(exchange, 'binance')['level'] == 'unknown', exchange

    def test_레지스트리에_없는_거래소도_unknown_으로_답한다(self):
        assert vasp_gate('nonexistent', 'binance')['level'] == 'unknown'


class TestThirdPartyGate:
    def test_스왑_서비스_송금은_unknown_이다(self):
        # 국내 거래소 입금 규정은 송신인이 회원 본인임을 전제로 쓰여 있어,
        # 제3자인 스왑 서비스가 보내는 형태를 어떻게 처리하는지 확인하지 못했다.
        gate = third_party_deposit_gate('upbit')
        assert gate['kind'] == 'third_party'
        assert gate['level'] == 'unknown'
