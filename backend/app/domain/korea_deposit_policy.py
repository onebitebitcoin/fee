"""국내 거래소 입금 정책 — 팔 때(매도) 경로의 실행 가능성 판정 단일 기준.

매도 경로의 마지막 구간은 언제나 '무언가 → 국내 거래소 입금'이다. 이 구간은 수수료가 아니라
거래소가 입금을 받아주는지에서 막히는데, 그 규칙이 보내는 쪽에 따라 갈린다.

  보내는 쪽이 개인 지갑      → 지갑 주소를 미리 등록하고 본인 소유를 인증해야 한다.
  보내는 쪽이 해외 거래소     → 그 거래소가 국내 거래소의 입금 허용 목록에 있어야 한다.

두 규칙을 각각 `PERSONAL_WALLET_POLICIES` 와 `VASP_DEPOSIT_POLICIES` 에 담는다.

입금이 성립하려면 여기에 축이 하나 더 맞아야 한다. 위 두 규칙이 '누가 보내는가'를 따진다면,
`USDT_DEPOSIT_NETWORK_POLICIES` 는 '어느 체인으로 오는가'를 따진다. 해외 거래소가 어떤
네트워크로 USDT 를 출금할 수 있다는 사실은 국내 거래소가 그 네트워크로 입금 주소를 발급한다는
뜻이 아니다. 두 축은 서로를 보증하지 않으므로 함께 확인해야 한다. 예를 들어 OKX 는 빗썸의
입금 허용 목록에 있지만, OKX 가 출금을 지원하는 Berachain 은 빗썸이 받는 체인이 아니다.

원칙: 근거를 확인하지 못한 값은 채우지 않는다. 추정치를 넣으면 실행 가능성을 잘못 보장하게
되고, 그 피해는 자산이 묶이는 형태로 나타난다.

주의(거래소 개편): 코빗은 미래에셋에 인수되어 '디지털엑스(Digital X)'로 사명이 바뀌었다.
이 코드베이스는 거래소 id 로 여전히 `korbit` 을 쓰므로, 출처 표기만 새 이름을 따른다.

주의(2026년 규제 변화): FIU 특정금융정보법 시행령 개정안이 2026-08-11 국무회의를 통과해
트래블룰의 100만원 기준금액이 폐지되고 모든 이전거래에 적용된다. 개인지갑 거래는 송·수신인이
동일한 경우에만 허용된다. 시행령 공포 후 6개월 경과일부터 시행이므로, 아래 `threshold_krw`
값들은 시행 시점에 맞춰 None(금액 무관)으로 바꿔야 한다.
"""
from __future__ import annotations

from dataclasses import dataclass

from backend.app.domain.path_helpers import normalize_usdt_network

# 입금 제약의 심각도. 기존 게이트맨 레지스트리의 level 값과 같은 어휘를 쓴다.
#   blocked  — 현재 수단으로는 입금이 사실상 불가능하다
#   required — 사전 절차(지갑 등록·인증)를 마쳐야 반영된다
#   review   — 입금은 되지만 증빙 심사를 거친다
#   unknown  — 공식 근거를 확보하지 못했다
DepositGateLevel = str


@dataclass(frozen=True)
class PersonalWalletDepositPolicy:
    """개인 지갑에서 국내 거래소로 입금할 때의 규칙."""

    exchange: str
    #: 이 금액 이상부터 등록·인증이 필요하다. None 이면 금액과 무관하게 필요하다.
    threshold_krw: int | None
    #: 거래소가 등록을 받아주는 개인지갑 전체 목록(표시용).
    registrable_wallets: tuple[str, ...]
    #: 위 목록 중 비트코인을 담을 수 있는 지갑. 비어 있으면 BTC 를 보낼 수단이 없다는 뜻이다.
    #: 다만 거래소가 그 지갑의 '비트코인 네트워크 주소'까지 등록받는지는 별도 확인이 필요하다
    #: (업비트가 메타마스크를 ETH·ERC-20 계열로만 지원했던 전례가 있다).
    bitcoin_capable_wallets: tuple[str, ...]
    #: 등록하지 않은 지갑에서 입금했을 때 실제로 벌어지는 일
    unregistered_outcome: str
    source: str
    source_url: str


@dataclass(frozen=True)
class UsdtDepositNetworkPolicy:
    """국내 거래소가 USDT 입금을 받아주는 네트워크."""

    exchange: str
    #: `normalize_usdt_network()` 와 같은 어휘로 쓴 정규화 키 집합.
    supported: frozenset[str]
    #: 출처가 이 거래소의 USDT 입금망을 빠짐없이 열거하는가.
    #: 참이면 목록 밖을 '받지 않는다'고 단정하고, 거짓이면 '확인하지 못했다'고 말한다.
    #: 두 경우 모두 경로에서 빠지지만, 이용자에게 전하는 문장이 달라야 한다.
    exhaustive: bool
    #: 출처를 확인한 날짜. 거래소가 망을 추가하면 이 값이 낡았는지 판단하는 기준이 된다.
    checked_on: str
    source: str
    source_url: str


@dataclass(frozen=True)
class VaspDepositPolicy:
    """해외 거래소에서 국내 거래소로 입금할 때의 규칙."""

    exchange: str
    #: 트래블룰 솔루션·본인 계정 확인으로 연동되어 입금이 자동 반영되는 해외 거래소.
    auto_deposit: frozenset[str]
    #: 목록에는 있으나 지갑 주소 등록이나 증빙 심사를 거쳐야 하는 해외 거래소
    #: (이른바 화이트리스트 구분. 등록 안내가 출금 기준으로 쓰여 있어 입금은 심사로 본다).
    review_required: frozenset[str]
    #: 이 금액 미만이면 목록과 무관하게 입금된다. None 이면 금액과 무관하게 목록을 따른다.
    threshold_krw: int | None
    source: str
    source_url: str


# ── 개인 지갑 입금 ──────────────────────────────────────────────────────────────
#
# 거래소마다 등록을 받아주는 지갑 목록이 다르다. 업비트만 EVM·알트체인 계열로만 이뤄져 있어
# 비트코인을 보낼 수단 자체가 없고, 나머지 네 곳은 렛저 나노·디센트·트러스트월렛·삼성 블록체인
# 월렛처럼 비트코인을 담는 지갑을 목록에 두고 있다.

PERSONAL_WALLET_POLICIES: dict[str, PersonalWalletDepositPolicy] = {
    'upbit': PersonalWalletDepositPolicy(
        exchange='upbit',
        threshold_krw=1_000_000,
        registrable_wallets=('메타마스크', '카이아', '팬텀', '폴카닷', '케플러'),
        # 다섯 지갑 모두 비트코인 온체인 주소를 만들지 못한다.
        bitcoin_capable_wallets=(),
        unregistered_outcome='입금이 보류되고, 해당 지갑을 등록해야 그때 반영됩니다.',
        source='업비트 고객센터 — 트래블룰 알아보기 / 디지털 자산 입출금 방식 안내',
        source_url='https://support.upbit.com/hc/ko/articles/4498679629337',
    ),
    'bithumb': PersonalWalletDepositPolicy(
        exchange='bithumb',
        threshold_krw=1_000_000,
        registrable_wallets=('메타마스크', '클립', '트러스트월렛', '아임토큰', 'OKX 월렛'),
        bitcoin_capable_wallets=('트러스트월렛', 'OKX 월렛'),
        unregistered_outcome='입금 신청과 증빙 심사를 거쳐야 하고 최대 7일이 걸리며, 거절되면 반환 신청으로 돌려받습니다.',
        source='빗썸 고객센터 — 빗썸 입출금 가능한 가상자산 거래소 목록 (2026-04-30 기준)',
        source_url='https://support.bithumb.com/hc/ko/articles/52814710561945',
    ),
    'coinone': PersonalWalletDepositPolicy(
        exchange='coinone',
        threshold_krw=1_000_000,
        registrable_wallets=(
            '메타마스크', '팬텀', '카이아 월렛', '카카오클립', '밀크', '디센트',
            '삼성 블록체인 월렛', '렛저', '기린 월렛', '디앱 포털 월렛', '케플러 월렛',
        ),
        bitcoin_capable_wallets=('렛저', '디센트', '삼성 블록체인 월렛'),
        unregistered_outcome="출처가 불분명한 지갑에서 들어온 입금은 '입금반영불가'로 처리됩니다.",
        source='코인원 고객센터 — 출금 가능 가상자산 사업자 리스트 (2026-08-06 기준)',
        source_url='https://support.coinone.co.kr/support/solutions/articles/31000167814',
    ),
    'korbit': PersonalWalletDepositPolicy(
        exchange='korbit',
        threshold_krw=1_000_000,
        registrable_wallets=(
            '디센트', '렛저 나노', '마이이더월렛', '메타마스크', '삼성 블록체인 월렛',
            '원포켓', '엑스플라 볼트', '카이아', '클립', '케플러', '트러스트월렛', '티월렛', '팬텀',
        ),
        bitcoin_capable_wallets=('렛저 나노', '디센트', '삼성 블록체인 월렛', '트러스트월렛'),
        unregistered_outcome='지갑 주소 등록 심사를 마쳐야 반영됩니다.',
        source='디지털엑스(구 코빗) 고객센터 — 입출금 가능 거래소/개인지갑 리스트',
        source_url='https://lightning.digitalx.miraeasset.com/faq/list/?category=2vEUaayuGZrWE0NLPdI834',
    ),
    'gopax': PersonalWalletDepositPolicy(
        exchange='gopax',
        threshold_krw=1_000_000,
        registrable_wallets=(
            '메타마스크', '마이이더월렛', '카이아 월렛', '렛저 나노', '아임토큰', '트러스트월렛',
            '디센트', '삼성 블록체인 월렛', '밀로월렛', '팬텀', '로아 월렛', '클링 월렛',
            '갤럭시아 월렛', '글루와 월렛', '클립', '레지스 월렛', 'BZPAY 월렛', '케플러 월렛',
        ),
        bitcoin_capable_wallets=('렛저 나노', '트러스트월렛', '디센트', '삼성 블록체인 월렛'),
        unregistered_outcome='자동 반영되지 않고 증빙서류 제출과 심사를 거쳐야 반영됩니다.',
        source='고팍스 고객지원 — 개인지갑주소 등록 (2026-04-29 기준)',
        source_url='https://streami.atlassian.net/wiki/spaces/GHC/pages/1148125310',
    ),
}


# ── 해외 거래소 입금 ────────────────────────────────────────────────────────────
#
# 트래블룰 솔루션(CODE·VerifyVASP·VerifyNAME)이나 본인 계정 확인으로 연동된 거래소는 입금이
# 자동 반영된다. '화이트리스트'·'지갑 주소 등록' 구분은 안내가 출금 기준으로 쓰여 있어, 입금
# 방향은 증빙·심사를 거치는 것으로 본다. 목록에 아예 없으면 기준 금액 이상에서 막힌다.

VASP_DEPOSIT_POLICIES: dict[str, VaspDepositPolicy] = {
    'upbit': VaspDepositPolicy(
        exchange='upbit',
        # '계정주 확인 연동 가상자산사업자' — 두 계정의 계정주가 같으면 그대로 반영된다.
        auto_deposit=frozenset({'binance', 'okx', 'bybit', 'bitget', 'gate'}),
        # '위험평가 통과 해외 가상자산사업자' — 문서가 입금 방식을 '수동 입금 반영(입금 출처 증빙
        # 승인 후 반영)'으로 밝히고 있어 심사 대상이다. 이전에는 이 둘을 '입금만 지원되니 파는
        # 방향은 자동 반영'으로 보아 auto_deposit 에 넣었는데, 등급 자체가 다른 것이었다.
        review_required=frozenset({'kraken', 'coinbase'}),
        threshold_krw=1_000_000,
        source='업비트 고객센터 — 입출금 가능 가상자산사업자(VASP) 추가 리스트 (목록 기준일 2026-09-16)',
        source_url='https://support.upbit.com/hc/ko/articles/5048002559897',
    ),
    'bithumb': VaspDepositPolicy(
        exchange='bithumb',
        # 트래블룰 솔루션: 비트겟·바이비트·OKX 등 / 본인 계정 확인 서비스: 바이낸스
        auto_deposit=frozenset({'binance', 'okx', 'bybit', 'bitget'}),
        # 화이트리스트 구분: 크라켄·코인베이스
        review_required=frozenset({'kraken', 'coinbase'}),
        # Gate 는 2026-04-30 목록 어디에도 없다 → '그 외 VASP'로 100만원 미만만 가능
        threshold_krw=1_000_000,
        source='빗썸 고객센터 — 빗썸 입출금 가능한 가상자산 거래소 목록 (2026-04-30 기준)',
        source_url='https://support.bithumb.com/hc/ko/articles/52814710561945',
    ),
    'coinone': VaspDepositPolicy(
        exchange='coinone',
        # CODE 연동: 비트겟·바이비트·OKX·게이트 / CODE ID Connect: 바이낸스
        auto_deposit=frozenset({'binance', 'okx', 'bybit', 'bitget', 'gate'}),
        # 외부지갑 출금주소 등록(화이트리스팅) 가능 해외거래소: 크라켄·코인베이스
        review_required=frozenset({'kraken', 'coinbase'}),
        threshold_krw=1_000_000,
        source='코인원 고객센터 — 출금 가능 가상자산 사업자 리스트 (2026-07-20 / 08-06 기준)',
        source_url='https://support.coinone.co.kr/support/solutions/articles/31000167814',
    ),
    'korbit': VaspDepositPolicy(
        exchange='korbit',
        # 트래블룰 솔루션: 게이트·바이비트·비트겟·OKX 등 / 본인 계정 확인: 바이낸스
        auto_deposit=frozenset({'binance', 'okx', 'bybit', 'bitget', 'gate'}),
        # 지갑 주소 등록 구분: 코인베이스·크라켄
        review_required=frozenset({'kraken', 'coinbase'}),
        threshold_krw=1_000_000,
        source='디지털엑스(구 코빗) 고객센터 — 입출금 가능 거래소/개인지갑 리스트',
        source_url='https://lightning.digitalx.miraeasset.com/faq/list/?category=2vEUaayuGZrWE0NLPdI834',
    ),
    'gopax': VaspDepositPolicy(
        exchange='gopax',
        # VerifyNAME: 바이낸스·비트겟·OKX / CODE: 게이트.
        # 바이비트·크라켄·코인베이스는 목록에 없어 기준 금액 이상에서 막힌다.
        auto_deposit=frozenset({'binance', 'okx', 'bitget', 'gate'}),
        review_required=frozenset(),
        threshold_krw=1_000_000,
        source='고팍스 고객지원 — 입출금 가능 가상자산사업자 리스트 (2026-09-16 기준)',
        source_url='https://streami.atlassian.net/wiki/spaces/GHC/pages/1061093511',
    ),
}


# ── USDT 입금 네트워크 ──────────────────────────────────────────────────────────
#
# 국내 거래소가 USDT 입금 주소를 발급하는 체인은 소수다. 반면 해외 거래소는 출금 지원 체인을
# 빠르게 늘려서, 신생 체인일수록 출금 수수료가 싸다. 그래서 수수료만 보고 경로를 고르면
# 국내 거래소가 받지 않는 체인이 가장 싼 경로로 올라온다.
#
# 다섯 곳 중 넷은 지원 망을 빠짐없이 밝히는 출처를 확보했고, 고팍스와 업비트는 그러지 못했다.
# 그 차이를 `exhaustive` 로 남긴다. 확인한 만큼만 단정하기 위해서다.

_NETWORK_DISPLAY: dict[str, str] = {
    'trc20': 'Tron (TRC20)',
    'erc20': 'Ethereum (ERC20)',
    'kaia': 'Kaia',
    'aptos': 'Aptos',
}

USDT_DEPOSIT_NETWORK_POLICIES: dict[str, UsdtDepositNetworkPolicy] = {
    'upbit': UsdtDepositNetworkPolicy(
        exchange='upbit',
        supported=frozenset({'trc20', 'erc20', 'aptos', 'kaia'}),
        # 네 망 각각은 공지로 확인되지만, 한 문서가 '현재 지원 망 전부'를 밝히는 형태가 아니라
        # 추가 공지를 누적해 만든 목록이다. 전수 열거로 볼 근거가 없어 거짓으로 둔다.
        exhaustive=False,
        checked_on='2026-09-20',
        source='업비트 공지 — 테더(USDT) 입출금 네트워크 안내 (4273 / 5242 / 5455)',
        source_url='https://www.upbit.com/service_center/notice?id=5455',
    ),
    'bithumb': UsdtDepositNetworkPolicy(
        exchange='bithumb',
        supported=frozenset({'trc20', 'erc20', 'kaia', 'aptos'}),
        exhaustive=True,
        checked_on='2026-09-20',
        source='빗썸 멀티체인 입출금 현황 API (자산·네트워크 전수)',
        source_url='https://www.bithumb.com/react/info/inout-condition',
    ),
    'coinone': UsdtDepositNetworkPolicy(
        exchange='coinone',
        supported=frozenset({'trc20'}),
        exhaustive=True,
        checked_on='2026-09-20',
        source='코인원 고객센터 — 지원 중인 가상자산 종류 및 네트워크 유형 (문서 기준일 2026-09-10)',
        source_url='https://support.coinone.co.kr/support/solutions/articles/31000163237',
    ),
    'korbit': UsdtDepositNetworkPolicy(
        exchange='korbit',
        supported=frozenset({'trc20', 'erc20'}),
        exhaustive=True,
        checked_on='2026-09-20',
        source='디지털엑스(구 코빗) 통화 목록 API — networkList[].depositStatus 전수',
        source_url='https://api.korbit.co.kr/v2/currencies',
    ),
    'gopax': UsdtDepositNetworkPolicy(
        exchange='gopax',
        supported=frozenset({'trc20'}),
        # 자산 API 가 자산당 네트워크를 하나만 표현하는 스키마라, 트론만 받는 것인지
        # 대표 망만 노출한 것인지 응답만으로는 구분할 수 없다.
        exhaustive=False,
        checked_on='2026-09-20',
        source='고팍스 자산 API — USDT networkName',
        source_url='https://api.gopax.co.kr/assets',
    ),
}


def _network_names(keys: frozenset[str]) -> str:
    """정규화 키를 사람이 읽는 표기로 옮긴다. 순서는 표시용 사전의 등재 순서를 따른다."""
    named = [label for key, label in _NETWORK_DISPLAY.items() if key in keys]
    return ', '.join(named + sorted(key for key in keys if key not in _NETWORK_DISPLAY))


def usdt_deposit_network_gate(
    exchange: str,
    network_label: str,
    live_enabled: bool | None = None,
) -> dict | None:
    """해외 거래소가 이 네트워크로 보낸 USDT 를 국내 거래소가 받아주는지.

    두 축을 함께 본다. 정적 정책은 '이 거래소가 이 망을 지원하는가'를 답하고,
    `live_enabled` 는 크롤이 수집한 '지금 열려 있는가'를 답한다. 수집원이 없는 거래소는
    None 이 들어오고, 그때는 정적 정책만으로 판정한다.

    실시간 값은 정적 목록을 닫기만 하고 열지는 못한다. API 에 보이는 망이라도 우리가 지원을
    확인하지 못했으면 추천하지 않는다.

    받아주는 것이 확인되면 None 을 돌려준다.
    """
    policy = USDT_DEPOSIT_NETWORK_POLICIES.get(exchange)
    if policy is None:
        return {
            'kind': 'usdt_deposit_network',
            'level': 'unknown',
            'label': 'USDT 입금망 확인 필요',
            'desc': (
                '이 거래소가 USDT 입금을 어느 네트워크로 받는지 확인하지 못했습니다. '
                '보내기 전에 거래소의 입금 주소 발급 화면에서 해당 네트워크를 선택할 수 있는지 확인하세요.'
            ),
            'source': None,
            'source_url': None,
        }

    if normalize_usdt_network(network_label) in policy.supported:
        if live_enabled is False:
            return {
                'kind': 'usdt_deposit_network',
                'level': 'blocked',
                'label': '거래소 점검으로 입금 중단',
                'desc': (
                    f'이 거래소는 평소 {network_label} 네트워크로 USDT 입금을 받지만, '
                    f'지금은 해당 네트워크를 점검 중이라 입금이 반영되지 않습니다. '
                    f'점검 중에 보내면 자산이 묶일 수 있으니 다른 네트워크를 쓰거나 재개를 기다리세요.'
                ),
                'source': policy.source,
                'source_url': policy.source_url,
            }
        return None

    supported_text = _network_names(policy.supported)
    if policy.exhaustive:
        return {
            'kind': 'usdt_deposit_network',
            'level': 'blocked',
            'label': 'USDT 입금 미지원 네트워크',
            'desc': (
                f'이 거래소는 {network_label} 네트워크로 USDT 입금을 받지 않습니다. '
                f'받아주는 네트워크는 {supported_text}입니다({policy.checked_on} 확인). '
                f'지원하지 않는 네트워크로 보내면 입금이 반영되지 않고 자산을 잃을 수 있습니다.'
            ),
            'source': policy.source,
            'source_url': policy.source_url,
        }

    return {
        'kind': 'usdt_deposit_network',
        'level': 'unknown',
        'label': 'USDT 입금망 확인 필요',
        'desc': (
            f'이 거래소가 {network_label} 네트워크로 USDT 입금을 받는지 확인하지 못했습니다. '
            f'입금이 확인된 네트워크는 {supported_text}입니다({policy.checked_on} 확인). '
            f'다른 네트워크로 보내려면 거래소의 입금 주소 발급 화면에서 먼저 확인하세요.'
        ),
        'source': policy.source,
        'source_url': policy.source_url,
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

    threshold_text = (
        f'{_fmt_krw(policy.threshold_krw)} 이상 입금은'
        if policy.threshold_krw is not None
        else '금액과 무관하게 모든 입금은'
    )

    # 등록 가능한 지갑 중 비트코인을 담을 수 있는 게 하나도 없으면 절차를 밟아도 뚫리지 않는다.
    if not policy.bitcoin_capable_wallets:
        wallets = ', '.join(policy.registrable_wallets)
        return {
            'kind': 'personal_wallet',
            'level': 'blocked',
            'label': '비트코인 개인지갑 입금 불가',
            'desc': (
                f'{threshold_text} 등록·인증된 개인지갑에서만 받습니다. '
                f'등록할 수 있는 지갑은 {wallets}인데 모두 비트코인 온체인 주소를 만들지 못해, '
                f'개인 지갑의 BTC 를 이 거래소로 곧장 보낼 수 없습니다. '
                f'미등록 지갑에서 보내면 {policy.unregistered_outcome}'
            ),
            'source': policy.source,
            'source_url': policy.source_url,
        }

    btc_wallets = ', '.join(policy.bitcoin_capable_wallets)
    return {
        'kind': 'personal_wallet',
        'level': 'required',
        'label': '입금 지갑 사전 등록 필요',
        'desc': (
            f'{threshold_text} 등록·인증된 개인지갑에서만 받습니다. '
            f'등록 가능한 지갑 중 비트코인을 담을 수 있는 것은 {btc_wallets}입니다. '
            f'다만 거래소가 이 지갑들의 비트코인 네트워크 주소까지 등록받는지는 확인하지 못했으니, '
            f'보내기 전에 등록이 되는지 먼저 확인하세요. '
            f'미등록 지갑에서 보내면 {policy.unregistered_outcome}'
        ),
        'source': policy.source,
        'source_url': policy.source_url,
    }


def vasp_gate(exchange: str, global_exchange: str, amount_krw: float) -> dict | None:
    """해외 거래소에서 이 국내 거래소로 입금할 때 걸리는 관문."""
    policy = VASP_DEPOSIT_POLICIES.get(exchange)
    if policy is None:
        return {
            'kind': 'vasp',
            'level': 'unknown',
            'label': '입금 가능 거래소 목록 확인 필요',
            'desc': (
                '이 국내 거래소가 해당 해외 거래소발 입금을 받는지 공식 목록으로 확인하지 못했습니다. '
                '목록에 없는 거래소에서 보내면 입금이 보류되거나 반환될 수 있으니 거래소 공지를 확인하세요.'
            ),
            'source': None,
            'source_url': None,
        }

    # 기준 금액 미만이면 목록과 무관하게 입금된다.
    if policy.threshold_krw is not None and amount_krw < policy.threshold_krw:
        return None

    if global_exchange in policy.auto_deposit:
        return None

    threshold_text = (
        f'{_fmt_krw(policy.threshold_krw)} 이상 입금은'
        if policy.threshold_krw is not None
        else '모든 입금은'
    )

    if global_exchange in policy.review_required:
        return {
            'kind': 'vasp',
            'level': 'review',
            'label': '입금 증빙 심사 필요',
            'desc': (
                f'이 해외 거래소는 트래블룰 연동이 아니라 지갑 주소 등록 대상입니다. '
                f'{threshold_text} 본인 계정임을 증빙해 심사를 통과해야 반영됩니다.'
            ),
            'source': policy.source,
            'source_url': policy.source_url,
        }

    return {
        'kind': 'vasp',
        'level': 'blocked',
        'label': '입금 미지원 해외 거래소',
        'desc': (
            f'이 해외 거래소는 해당 국내 거래소의 입금 지원 목록에 없습니다. '
            f'{threshold_text} 반영되지 않고 반환 절차를 거쳐야 합니다.'
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
