"""국내 거래소 입금 정책 — 팔 때(매도) 경로의 실행 가능성 판정 단일 기준.

매도 경로의 마지막 구간은 언제나 '무언가 → 국내 거래소 입금'이다. 이 구간은 수수료가 아니라
거래소가 입금을 받아주는지에서 막히는데, 그 규칙이 보내는 쪽에 따라 갈린다.

  보내는 쪽이 개인 지갑      → 지갑 주소를 미리 등록하고 본인 소유를 인증해야 한다.
  보내는 쪽이 해외 거래소     → 그 거래소가 국내 거래소의 입금 허용 목록에 있어야 한다.

두 규칙을 각각 `PERSONAL_WALLET_POLICIES` 와 `VASP_DEPOSIT_POLICIES` 에 담는다.

원칙: 근거를 확인하지 못한 값은 채우지 않고 None 으로 둔다. 화면도 '확인 필요'로 표시한다.
추정치를 넣으면 실행 가능성을 잘못 보장하게 되고, 그 피해는 자산이 묶이는 형태로 나타난다.

주의(2026년 규제 변화): FIU 특정금융정보법 시행령 개정안이 2026-08-11 국무회의를 통과해
트래블룰의 100만원 기준금액이 폐지되고 모든 이전거래에 적용된다. 개인지갑 거래는 송·수신인이
동일한 경우에만 허용된다. 시행령 공포 후 6개월 경과일부터 시행이므로, 아래 `threshold_krw`
값들은 시행 시점에 맞춰 None(금액 무관)으로 바꿔야 한다.
"""
from __future__ import annotations

from dataclasses import dataclass

# 입금 제약의 심각도. 기존 게이트맨 레지스트리의 level 값과 같은 어휘를 쓴다.
#   blocked  — 현재 수단으로는 입금이 사실상 불가능하다
#   required — 사전 절차를 마쳐야 입금이 반영된다
#   review   — 입금은 되지만 증빙 심사를 거친다
#   unknown  — 공식 근거를 확보하지 못했다
DepositGateLevel = str


@dataclass(frozen=True)
class PersonalWalletDepositPolicy:
    """개인 지갑에서 국내 거래소로 입금할 때의 규칙."""

    exchange: str
    #: 이 금액 이상부터 등록·인증이 필요하다. None 이면 금액과 무관하게 필요하다.
    threshold_krw: int | None
    #: 거래소가 등록을 받아주는 개인지갑 목록(표시용). 빈 튜플이면 목록을 확인하지 못한 것이다.
    registrable_wallets: tuple[str, ...]
    #: 비트코인 온체인 지갑을 등록할 수 있는지. None 이면 확인하지 못했다.
    supports_bitcoin_wallet: bool | None
    #: 등록하지 않은 지갑에서 입금했을 때 실제로 벌어지는 일
    unregistered_outcome: str
    source: str
    source_url: str


@dataclass(frozen=True)
class VaspDepositPolicy:
    """해외 거래소에서 국내 거래소로 입금할 때의 규칙."""

    exchange: str
    #: 입금을 받아주는 해외 거래소 id 집합. None 이면 공식 목록을 확보하지 못했다.
    deposit_allowed: frozenset[str] | None
    source: str
    source_url: str


# ── 개인 지갑 입금 ──────────────────────────────────────────────────────────────
#
# 확인된 등록 가능 지갑이 모두 EVM·알트체인 계열이라는 점이 핵심이다. 비트코인 온체인 지갑
# (Sparrow, Electrum, Unisat, Xverse, Ledger 의 BTC 계정 등)은 어느 거래소 목록에도 없다.
# 그래서 개인 지갑의 BTC 를 국내 거래소로 곧장 보내는 경로는 기준 금액을 넘는 순간 막힌다.

PERSONAL_WALLET_POLICIES: dict[str, PersonalWalletDepositPolicy] = {
    'upbit': PersonalWalletDepositPolicy(
        exchange='upbit',
        threshold_krw=1_000_000,
        registrable_wallets=('메타마스크', '카이아', '팬텀', '폴카닷', '케플러'),
        supports_bitcoin_wallet=False,
        unregistered_outcome='입금이 보류되고, 해당 지갑을 등록해야 그때 반영됩니다.',
        source='업비트 고객센터 — 트래블룰 알아보기 / 디지털 자산 입출금 방식 안내',
        source_url='https://support.upbit.com/hc/ko/articles/4498679629337',
    ),
    'bithumb': PersonalWalletDepositPolicy(
        exchange='bithumb',
        # 2024-01-01 부터 금액과 무관하게 모든 입금이 신청 대상이다.
        threshold_krw=None,
        registrable_wallets=('메타마스크', '카카오 클립', '부리또 월렛', '도시볼트'),
        supports_bitcoin_wallet=False,
        unregistered_outcome='입금 신청과 증빙 심사를 거쳐야 하고 최대 7일이 걸리며, 거절되면 반환 신청으로 돌려받습니다.',
        source='빗썸 공지 — 가상자산 입금 방식 변경 안내 (2023-11-27 시행)',
        source_url='https://feed.bithumb.com/notice',
    ),
    'coinone': PersonalWalletDepositPolicy(
        exchange='coinone',
        threshold_krw=1_000_000,
        registrable_wallets=('메타마스크', '팬텀', '카이아 월렛', '기린 월렛'),
        # 렛저 하드웨어 지갑은 신분증과 실물을 함께 촬영하는 방식으로 등록을 받는다는 안내가 있으나,
        # 그 안내가 출금 주소록 맥락이라 비트코인 입금에도 그대로 적용되는지 확인하지 못했다.
        supports_bitcoin_wallet=None,
        unregistered_outcome="출처가 불분명한 지갑에서 들어온 입금은 '입금반영불가'로 처리됩니다.",
        source='코인원 고객센터 — 가상자산 주소록 본인인증 / 미신고거래소 입·출금 제한 안내',
        source_url='https://support.coinone.co.kr/support/solutions/articles/31000163028',
    ),
    'korbit': PersonalWalletDepositPolicy(
        exchange='korbit',
        threshold_krw=1_000_000,
        registrable_wallets=('카카오클립', '카이카스', '메타마스크'),
        supports_bitcoin_wallet=None,
        unregistered_outcome='증빙센터에서 지갑 주소 등록 심사를 마쳐야 반영됩니다.',
        source='코빗 고객센터 — 증빙센터 지갑주소 등록',
        source_url='https://www.korbit.co.kr/faq/list',
    ),
    'gopax': PersonalWalletDepositPolicy(
        exchange='gopax',
        # 입금 시점의 원화 환산가가 100만원을 넘으면 자동 반영을 막는다.
        threshold_krw=1_000_000,
        registrable_wallets=(),
        supports_bitcoin_wallet=None,
        unregistered_outcome='자동 반영이 제한되고 증빙서류 제출과 심사를 거쳐야 반영됩니다.',
        source='고팍스 고객지원 — 가상자산 입금 반영중 (트래블룰 미적용 사업자·개인지갑)',
        source_url='https://streami.atlassian.net/wiki/spaces/GHC/pages/1059684527',
    ),
}


# ── 해외 거래소 입금 ────────────────────────────────────────────────────────────
#
# 업비트만 공식 리스트를 확보했다. 나머지 네 곳은 목록을 찾지 못했으므로 None 으로 두고
# 화면에서 '확인 필요'로 알린다. 허용으로 가정하면 막히는 경로를 뚫린 것처럼 보여주게 된다.

VASP_DEPOSIT_POLICIES: dict[str, VaspDepositPolicy] = {
    'upbit': VaspDepositPolicy(
        exchange='upbit',
        # 2026-08-27 기준 업비트 입출금 지원 사업자 리스트.
        # 코인베이스·크라켄은 입금만 지원하는데, 매도 방향은 입금이라 문제되지 않는다.
        deposit_allowed=frozenset({'binance', 'okx', 'bybit', 'bitget', 'gate', 'coinbase', 'kraken'}),
        source='업비트 고객센터 — 입출금 지원 가상자산사업자 리스트 (2026-08-27 기준)',
        source_url='https://www.upbit.com/service_center/guide',
    ),
    'bithumb': VaspDepositPolicy(
        exchange='bithumb',
        deposit_allowed=None,
        source='빗썸 입출금 가능 거래소 목록 — 입금 방향 기준 확인 필요',
        source_url='https://support.bithumb.com/hc/ko/articles/52814710561945',
    ),
    'coinone': VaspDepositPolicy(exchange='coinone', deposit_allowed=None,
                                 source='코인원 출금 가능 사업자 리스트 — 입금 방향 기준 확인 필요',
                                 source_url='https://support.coinone.co.kr/support/solutions/articles/31000167814'),
    'korbit': VaspDepositPolicy(exchange='korbit', deposit_allowed=None,
                                source='코빗 증빙센터 거래소 리스트 — 입금 방향 기준 확인 필요',
                                source_url='https://www.korbit.co.kr/faq/list'),
    'gopax': VaspDepositPolicy(exchange='gopax', deposit_allowed=None,
                               source='고팍스 트래블룰 입금 가능 거래소 — 확인 필요',
                               source_url='https://streami.atlassian.net/wiki/spaces/GHC/pages/1059684527'),
}


def _fmt_krw(value: int) -> str:
    """100만원처럼 만 단위로 떨어지는 금액을 읽기 쉬운 한국어 표기로 바꾼다."""
    if value % 100_000_000 == 0:
        return f'{value // 100_000_000}억원'
    if value % 10_000 == 0:
        return f'{value // 10_000:,}만원'
    return f'{value:,}원'


def personal_wallet_gate(exchange: str, amount_krw: float) -> dict | None:
    """개인 지갑에서 이 거래소로 입금할 때 걸리는 관문.

    걸리는 게 없으면 None 을 돌려준다(기준 금액 미만이라 그대로 입금되는 경우).

    반환 dict 는 기존 게이트맨 레지스트리와 같은 모양(level/label/desc/source)이라
    화면이 두 가지를 같은 컴포넌트로 그릴 수 있다.
    """
    policy = PERSONAL_WALLET_POLICIES.get(exchange)
    if policy is None:
        return {
            'kind': 'personal_wallet',
            'level': 'unknown',
            'label': '입금 정책 확인 필요',
            'desc': '이 거래소의 개인지갑 입금 규정을 확인하지 못했습니다. 거래소 공지를 직접 확인하세요.',
            'source': None,
            'source_url': None,
        }

    # 기준 금액이 있고 그보다 적으면 별도 절차 없이 입금된다.
    if policy.threshold_krw is not None and amount_krw < policy.threshold_krw:
        return None

    wallets = ', '.join(policy.registrable_wallets) if policy.registrable_wallets else None
    threshold_text = (
        f'{_fmt_krw(policy.threshold_krw)} 이상 입금은'
        if policy.threshold_krw is not None
        else '금액과 무관하게 모든 입금은'
    )

    # 비트코인 온체인 지갑을 등록할 수 없다면 이 경로는 절차를 밟아도 뚫리지 않는다.
    if policy.supports_bitcoin_wallet is False:
        return {
            'kind': 'personal_wallet',
            'level': 'blocked',
            'label': '비트코인 개인지갑 입금 불가',
            'desc': (
                f'{threshold_text} 등록·인증된 개인지갑에서만 받습니다. '
                f'등록할 수 있는 지갑은 {wallets}인데 모두 비트코인 온체인 지갑이 아니어서, '
                f'개인 지갑의 BTC 를 이 거래소로 곧장 보낼 수 없습니다. '
                f'미등록 지갑에서 보내면 {policy.unregistered_outcome}'
            ),
            'source': policy.source,
            'source_url': policy.source_url,
        }

    if policy.supports_bitcoin_wallet is None:
        return {
            'kind': 'personal_wallet',
            'level': 'unknown',
            'label': '비트코인 지갑 등록 가능 여부 확인 필요',
            'desc': (
                f'{threshold_text} 등록·인증된 개인지갑에서만 받습니다. '
                + (f'확인된 등록 가능 지갑은 {wallets}입니다. ' if wallets else '')
                + f'비트코인 온체인 지갑을 등록할 수 있는지는 확인하지 못했습니다. '
                f'미등록 지갑에서 보내면 {policy.unregistered_outcome}'
            ),
            'source': policy.source,
            'source_url': policy.source_url,
        }

    return {
        'kind': 'personal_wallet',
        'level': 'required',
        'label': '입금 지갑 사전 등록 필요',
        'desc': (
            f'{threshold_text} 등록·인증된 개인지갑에서만 받습니다. '
            f'미등록 지갑에서 보내면 {policy.unregistered_outcome}'
        ),
        'source': policy.source,
        'source_url': policy.source_url,
    }


def vasp_gate(exchange: str, global_exchange: str) -> dict | None:
    """해외 거래소에서 이 국내 거래소로 입금할 때 걸리는 관문."""
    policy = VASP_DEPOSIT_POLICIES.get(exchange)
    if policy is None or policy.deposit_allowed is None:
        return {
            'kind': 'vasp',
            'level': 'unknown',
            'label': '입금 가능 거래소 목록 확인 필요',
            'desc': (
                '이 국내 거래소가 해당 해외 거래소발 입금을 받는지 공식 목록으로 확인하지 못했습니다. '
                '목록에 없는 거래소에서 보내면 입금이 보류되거나 반환될 수 있으니 거래소 공지를 확인하세요.'
            ),
            'source': policy.source if policy else None,
            'source_url': policy.source_url if policy else None,
        }

    if global_exchange in policy.deposit_allowed:
        return None

    return {
        'kind': 'vasp',
        'level': 'blocked',
        'label': '입금 미지원 해외 거래소',
        'desc': (
            '이 해외 거래소는 해당 국내 거래소의 입금 지원 목록에 없습니다. '
            '보내면 입금이 반영되지 않고 반환 절차를 거쳐야 합니다.'
        ),
        'source': policy.source,
        'source_url': policy.source_url,
    }


def third_party_deposit_gate(exchange: str) -> dict:
    """라이트닝 스왑 서비스를 거쳐 국내 거래소로 입금될 때의 관문.

    이 경우 국내 거래소가 자금을 받는 상대는 회원 본인의 지갑도, 등록된 해외 거래소도 아닌
    제3자인 스왑 서비스다. 국내 거래소들의 입금 규정은 송신인이 본인임을 전제로 쓰여 있어
    이 형태를 어떻게 처리하는지 공식 문서에서 확인하지 못했다.
    """
    policy = PERSONAL_WALLET_POLICIES.get(exchange)
    return {
        'kind': 'third_party',
        'level': 'unknown',
        'label': '제3자 송금 — 입금 처리 확인 필요',
        'desc': (
            '라이트닝 스왑 서비스가 거래소로 보내는 형태라, 국내 거래소 입장에서는 송신인이 '
            '회원 본인이 아닙니다. 국내 거래소의 입금 규정은 송신인이 본인임을 전제로 하므로 '
            '이 경로를 받아주는지 거래소에 확인해야 합니다.'
        ),
        'source': policy.source if policy else None,
        'source_url': policy.source_url if policy else None,
    }
