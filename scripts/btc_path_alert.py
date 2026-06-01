#!/usr/bin/env python3
"""
동적 BTC 경로 알림 스크립트.

실시간으로 프로모션/스프레드를 크롤링하고
최적 경로를 계산해서 텔레그램으로 전송한다.

사용법:
    python scripts/btc_path_alert.py [--amount 1000000] [--exchange binance]
"""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s: %(message)s')
logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


def _fmt_krw(amount: int) -> str:
    return f"{amount:,}원"


def _fmt_pct(pct: float) -> str:
    return f"{pct:.4f}%"


def _quote_strategy_label(strategy: str) -> str:
    labels = {
        'btc_direct': 'BTC 직접',
        'usdt_taker': 'USDT/taker',
        'fdusd_maker': '⚡FDUSD/maker',
        'lightning_exit': '⚡LN',
    }
    return labels.get(strategy, strategy)


def _exit_label(path: dict) -> str:
    """글로벌 exit 방식 레이블 (온체인이면 빈 문자열)."""
    mode = path.get('global_exit_mode', 'onchain')
    if mode == 'lightning_direct':
        return ' +⚡LN직접'
    if mode == 'lightning_swap':
        svc = path.get('ln_swap_display', '')
        fee_pct = next(
            (s['fee_pct'] * 100 for s in __import__('backend.app.domain.paths_dynamic', fromlist=['LIGHTNING_SWAP_SERVICES']).LIGHTNING_SWAP_SERVICES if s['name'] == path.get('ln_swap_service')),
            None,
        )
        fee_str = f'{fee_pct:.1f}%' if fee_pct is not None else ''
        return f' +⚡LN→{svc}({fee_str})'
    return ''


def _destination_label(path: dict) -> str:
    return ''


def _build_telegram_message(result: dict, amount_krw: int) -> str:
    promo = result.get('promo_context', {})
    fdusd_active = promo.get('fdusd_maker_promo_active', False)
    spread_pct = promo.get('fdusd_convert_spread_pct', 0)
    errors = promo.get('errors', [])
    warnings = promo.get('warnings', [])
    source_details = promo.get('source_details', [])

    btc_price = result.get('global_btc_price_usd', 0)
    usd_krw = result.get('usd_krw_rate', 0)
    total_paths = result.get('total_paths_evaluated', 0)
    now_kst = datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')

    promo_status = (
        f"✅ FDUSD maker 0% 활성 (스프레드 {spread_pct:.3f}%)"
        if fdusd_active
        else "⏸ FDUSD maker 프로모션 미활성 (표준 0.1%)"
    )

    lines = [
        "📌 <b>BTC 최저비용 경로 (동적)</b>",
        "",
        f"<b>시세</b>: BTC ${btc_price:,.0f} / USD-KRW {usd_krw:,}원",
        f"<b>기준금액</b>: {_fmt_krw(amount_krw)} | 경로수: {total_paths}",
        f"<b>프로모션</b>: {promo_status}",
        "",
        "🏆 <b>TOP 5 경로</b>",
    ]

    top5 = result.get('top5', [])
    medals = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']
    for i, path in enumerate(top5[:5]):
        medal = medals[i]
        ex = path['korean_exchange']
        coin = path['transfer_coin']
        network = path.get('network', '')
        strategy = _quote_strategy_label(path.get('quote_strategy', ''))
        fee_krw = path['total_fee_krw']
        fee_pct = path['fee_pct']
        btc = path['btc_received']

        components = path.get('breakdown', {}).get('components', [])
        comp_parts = []
        for c in components:
            label = c.get('label', '')
            amt = c.get('amount_krw', 0)
            rate = c.get('rate_pct')
            if rate is not None:
                comp_parts.append(f"{label}: {amt:,}원({rate}%)")
            else:
                comp_parts.append(f"{label}: {amt:,}원")
        breakdown_str = ' + '.join(comp_parts) if comp_parts else ''

        lines.append(
            f"\n{medal} <b>{ex}</b> → {coin} {network} → Binance [{strategy}]"
            f"\n   수수료: <b>{_fmt_krw(fee_krw)} ({_fmt_pct(fee_pct)})</b>"
            f"\n   수령: {btc:.8f} BTC"
        )
        if breakdown_str:
            lines.append(f"   세부: {breakdown_str}")

    # FDUSD 절감 비교
    if top5:
        best = top5[0]
        if best.get('quote_strategy') == 'fdusd_maker':
            usdt_paths = [p for p in result.get('all_paths', []) if p.get('quote_strategy') == 'usdt_taker']
            if usdt_paths:
                saving = usdt_paths[0]['total_fee_krw'] - best['total_fee_krw']
                saving_pct = round(saving / amount_krw * 100, 4)
                lines.append(
                    f"\n💡 FDUSD 절감: <b>+{_fmt_krw(saving)} ({saving_pct}%)</b> (USDT/taker 대비)"
                )

    # ── 수수료 출처 섹션 ──────────────────────────────────────────
    lines.append("\n\n📎 <b>수수료 데이터 출처</b>")

    # 고정 출처 (항상 표시)
    fixed_sources = [
        ("국내 거래소 매수 수수료", "각 거래소 공식 수수료 기준 (빗썸 0.04% / 업비트 0.05%)",
         "https://www.bithumb.com/react/common/info/fee"),
        ("국내 USDT 출금 수수료", "각 거래소 실시간 API / 수수료 페이지 스크래핑 (TRC20 기준)",
         "https://upbit.com/service_center/fees"),
        ("Binance BTC 출금 수수료", "Binance 실시간 출금 수수료 API",
         "https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll"),
    ]
    for label, src, url in fixed_sources:
        lines.append(f"• <b>{label}</b>: {src}")
        lines.append(f"  └ 출처: {url}")

    # 동적 출처 (프로모션/스프레드)
    for sd in source_details:
        lines.append(f"• <b>{sd['label']}</b>: {sd['value']}")
        lines.append(f"  └ 출처: {sd['source']}")
        if sd.get('url'):
            lines.append(f"  └ URL: {sd['url']}")

    if warnings:
        lines.append(f"\n⚠️ 주의: {' | '.join(warnings)}")
    if errors:
        lines.append(f"❌ 오류: {' | '.join(errors)}")

    lines.append(f"\n🕐 <b>조회시각</b>: {now_kst}")
    return '\n'.join(lines)


def send_telegram(message: str) -> bool:
    """~/.claude/scripts/telegram-send.sh 를 통해 메시지 전송.
    4000자 초과 시 자동 분할.
    """
    script = os.path.expanduser('~/.claude/scripts/telegram-send.sh')
    if not os.path.exists(script):
        logger.error('텔레그램 스크립트 없음: %s', script)
        return False

    MAX_LEN = 3800
    chunks = []
    if len(message) <= MAX_LEN:
        chunks = [message]
    else:
        # 빈 줄 기준으로 섹션 분리 후 청크 조합
        sections = message.split('\n\n')
        current = ''
        for sec in sections:
            candidate = (current + '\n\n' + sec).lstrip('\n')
            if len(candidate) <= MAX_LEN:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = sec
        if current:
            chunks.append(current)

    success = True
    for i, chunk in enumerate(chunks, 1):
        suffix = f'\n<i>({i}/{len(chunks)})</i>' if len(chunks) > 1 else ''
        result = subprocess.run([script, chunk + suffix], capture_output=True, text=True)
        if result.returncode != 0:
            logger.error('텔레그램 전송 실패 (청크 %d): %s', i, result.stderr)
            success = False
        else:
            logger.info('텔레그램 전송 성공 (청크 %d/%d)', i, len(chunks))
    return success


TRAVEL_RULE_THRESHOLD_KRW = 1_000_000  # 100만원

# 거래소별 개인지갑 출금 정책 (트래블룰 시행 이후)
KOREA_EXCHANGE_WITHDRAWAL_POLICY: dict[str, str] = {
    'upbit':   '화이트리스트 등록 필요 (업비트앱 → 출금관리 → 외부지갑 등록)',
    'bithumb': '본인 지갑 인증 필요 (빗썸 고객센터 또는 앱 내 지갑 등록)',
    'korbit':  '개인지갑 사전 등록 필요 (코빗 앱 → 출금 → 지갑 추가)',
    'coinone': '외부 지갑 등록 필요 (코인원 앱 → 자산 → 출금 → 주소록 등록)',
    'gopax':   '본인 지갑 확인 절차 필요 (고팍스 고객센터 확인 권장)',
}


def _travel_rule_line(amount_krw: int, korean_ex: str) -> str:
    """트래블룰 적용 여부 + 거래소별 안내."""
    policy = KOREA_EXCHANGE_WITHDRAWAL_POLICY.get(korean_ex, '거래소 정책 확인 필요')
    if amount_krw >= TRAVEL_RULE_THRESHOLD_KRW:
        return (
            f"   🔴 <b>트래블룰 적용</b> ({amount_krw:,}원 ≥ 100만원) | "
            f"{policy}"
        )
    return f"   🟢 트래블룰 미적용 ({amount_krw:,}원 < 100만원)"


def _carf_line(korean_ex: str, global_ex: str) -> str:
    from backend.app.domain.carf_registry import get_carf_exchange_status
    c = get_carf_exchange_status(korean_ex, global_ex)
    return f"   CARF: {c['emoji']} {c['label']} | {c['detail']}"


def _build_exchange_summary_block(summaries: dict) -> list[str]:
    """거래소별 최저 수수료 + CARF 비교 블록."""
    from backend.app.domain.carf_registry import EXCHANGE_JURISDICTIONS, get_carf_exchange_status
    lines = ["\n📊 <b>글로벌 거래소별 최저 수수료 + CARF</b>"]
    ex_order = sorted(
        [(ex, s) for ex, s in summaries.items() if s.get('best_fee_krw') is not None],
        key=lambda x: x[1]['best_fee_krw'],
    )
    strategy_emoji = {'fdusd_maker': '⚡', 'usdt_taker': '💵', 'btc_direct': '₿'}
    for rank, (ex, s) in enumerate(ex_order, 1):
        fee = s['best_fee_krw']
        pct = s['best_fee_pct']
        strategy = s.get('best_strategy', '')
        emoji = strategy_emoji.get(strategy, '·')
        note = s.get('promo_note', '')
        bar_len = max(1, round(pct * 100))
        bar = '█' * min(bar_len, 30)
        marker = ' ← 최저' if rank == 1 else ''

        # CARF 정보 (Korean 대표: bithumb 기준)
        carf = get_carf_exchange_status('bithumb', ex)
        jur = EXCHANGE_JURISDICTIONS.get(ex)
        jur_str = f"{jur.flag} {jur.country}" if jur else "?"
        carf_str = f"{carf['emoji']} {carf['label']}"

        lines.append(
            f"  {rank}. <b>{ex:<8}</b> {emoji} {fee:,}원 수수료 ({pct:.3f}%) → {bar}{marker}"
        )
        lines.append(f"      └ 소재: {jur_str} | CARF: {carf_str}")
        if note:
            lines.append(f"      └ {note}")
    return lines


def _path_extra_lines(path: dict, amount_krw: int, ref_price_krw: int) -> list[str]:
    """경로별 추가 정보 (슬리피지·출금한도·LN한도) 줄 목록."""
    from backend.app.domain.korea_exchange_registry import withdrawal_limit_line, get_slippage
    from backend.app.services.mempool_service import exchange_fee_vs_mempool
    lines = []
    ex_kr = path.get('korean_exchange', '')
    ex_gl = path.get('global_exchange', '')
    btc = path.get('btc_received', 0)

    # 슬리피지는 breakdown에 fee_component로 포함되므로 여기선 생략
    # 출금 한도 초과 체크
    limit_warn = withdrawal_limit_line(ex_kr, btc, amount_krw)
    if limit_warn:
        lines.append(limit_warn)

    # 3. Binance LN 최대 0.01 BTC 한도 체크
    if path.get('global_exit_mode') in ('lightning_swap',) and ex_gl == 'binance':
        ln_max = 0.01
        if btc > ln_max:
            lines.append(
                f"   ⛔ Binance LN 1회 최대 {ln_max} BTC 초과 "
                f"({btc:.8f} BTC) — 분할 출금 필요"
            )

    return lines


def _build_telegram_message_all(result: dict, amount_krw: int, mode: str = 'cheapest', travel_rule: bool = False) -> str:
    promo = result.get('promo_context', {})
    fdusd_active = promo.get('fdusd_maker_promo_active', False)
    spread_pct = promo.get('fdusd_convert_spread_pct', 0)
    source_details = promo.get('source_details', [])
    errors = promo.get('errors', [])
    warnings = promo.get('warnings', [])
    now_kst = datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')

    total_paths = result.get('total_paths_evaluated', 0)
    exchanges_searched = result.get('global_exchanges_searched', [])
    promo_status = (
        f"✅ Binance FDUSD maker 0% 활성 (스프레드 {spread_pct:.3f}%)"
        if fdusd_active else "⏸ FDUSD 프로모션 미활성"
    )

    # 김치 프리미엄 섹션
    kimchi_data = result.get('kimchi_premiums', {})
    usdt_kimchi_data = result.get('usdt_kimchi_premiums', {})
    korean_usdt_prices = result.get('korean_usdt_prices', {})
    ref_price_krw = result.get('global_btc_price_krw_ref', 0)
    usd_krw_rate = promo.get('usd_krw_rate', 0)
    exchange_name_map = {
        'upbit': '업비트', 'bithumb': '빗썸', 'korbit': '코빗',
        'coinone': '코인원', 'gopax': '고팍스',
    }
    if kimchi_data and ref_price_krw:
        kimchi_parts = []
        for ex, prem in sorted(kimchi_data.items(), key=lambda x: x[1]):
            arrow = '▼' if prem < 0 else '▲'
            kimchi_parts.append(f"{exchange_name_map.get(ex, ex)} {arrow}{abs(prem):.2f}%")
        direction = '역프리미엄 (한국↓ 해외경유 불리)' if all(v < 0 for v in kimchi_data.values()) else '프리미엄 (한국↑ 해외경유 유리)' if all(v > 0 for v in kimchi_data.values()) else '혼재'
        kimchi_line = f"<b>BTC 김치 프리미엄</b> (vs Binance {ref_price_krw//10000:,}만원 / ${ref_price_krw//usd_krw_rate:,}): {' | '.join(kimchi_parts)}\n  └ {direction}"
    else:
        kimchi_line = ""

    if usdt_kimchi_data and usd_krw_rate:
        usdt_kimchi_parts = []
        for ex, prem in sorted(usdt_kimchi_data.items(), key=lambda x: x[1]):
            price = korean_usdt_prices.get(ex, 0)
            arrow = '▼' if prem < 0 else '▲'
            usdt_kimchi_parts.append(f"{exchange_name_map.get(ex, ex)} {arrow}{abs(prem):.2f}% ({price:,.0f}원)")
        usdt_direction = '디스카운트 (USDT 저렴 → 더 많은 USDT 수령)' if all(v < 0 for v in usdt_kimchi_data.values()) else '프리미엄 (USDT 비쌈 → 더 적은 USDT 수령)' if all(v > 0 for v in usdt_kimchi_data.values()) else '혼재'
        usdt_kimchi_line = f"<b>USDT 김치 프리미엄</b> (포렉스 기준 {usd_krw_rate:,.0f}원): {' | '.join(usdt_kimchi_parts)}\n  └ {usdt_direction}"
    else:
        usdt_kimchi_line = ""

    # mempool 혼잡도 조회
    from backend.app.services.mempool_service import fetch_mempool_fees, mempool_summary_line
    mempool = fetch_mempool_fees()
    mempool_line = mempool_summary_line(mempool, ref_price_krw) if mempool and ref_price_krw else ""

    lines = [
        "📌 <b>BTC 최저비용 경로 — 전 거래소 탐색</b>",
        "",
        f"<b>기준금액</b>: {_fmt_krw(amount_krw)} | 탐색 경로: {total_paths}개",
        f"<b>탐색 거래소</b>: {', '.join(exchanges_searched)}",
        f"<b>프로모션</b>: {promo_status}",
    ]
    if kimchi_line:
        lines.append(kimchi_line)
    if usdt_kimchi_line:
        lines.append(usdt_kimchi_line)
    if mempool_line:
        lines.append(mempool_line)
    all_sorted = result.get('all_paths', result.get('top10', []))

    def is_non_kyc(p: dict) -> bool:
        if p.get('global_exit_mode') == 'lightning_swap':
            return not p.get('ln_swap_kyc', True)
        return True

    medals = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']

    if mode == 'lightning':
        eligible = [p for p in all_sorted if p.get('global_exit_mode') == 'lightning_swap']
        top10 = eligible[:5]
        mode_header = "⚡ <b>Lightning 출금 TOP 5</b> (LN→온체인 스왑, 수령 BTC 최대 순)"
    else:
        # btc_direct: 국내거래소→개인지갑 직접 출금 → 트래블룰 사용자 마찰 발생
        # travel_rule 옵션 없을 때 기본 제외
        eligible = all_sorted if travel_rule else [p for p in all_sorted if p.get('quote_strategy') != 'btc_direct']
        top10 = eligible[:5]
        mode_header = "🏆 <b>전체 TOP 5 경로</b> (수령 BTC 최대 순)"

    lines += ["", mode_header]
    non_kyc_top5 = [p for p in eligible if is_non_kyc(p)][:5]
    for i, path in enumerate(top10):
        medal = medals[i] if i < len(medals) else f"{i+1}."
        ex_kr = path['korean_exchange']
        ex_gl = path.get('global_exchange', '?')
        coin = path['transfer_coin']
        network = path.get('network', '')
        strategy = _quote_strategy_label(path.get('quote_strategy', ''))
        fee_krw = path['total_fee_krw']
        fee_pct = path['fee_pct']
        btc = path['btc_received']

        components = path.get('breakdown', {}).get('components', [])
        comp_parts = []
        for c in components:
            amt = c.get('amount_krw', 0)
            rate = c.get('rate_pct')
            label = c.get('label', '')
            if rate is not None:
                comp_parts.append(f"{label}: {amt:,}원({rate}%)")
            else:
                comp_parts.append(f"{label}: {amt:,}원")

        # 수령 KRW 환산 및 보전율 (글로벌 기준가 사용)
        btc_value_krw = round(btc * ref_price_krw) if ref_price_krw else 0
        preservation_pct = btc_value_krw / amount_krw * 100 if amount_krw else 0
        net_loss_krw = amount_krw - btc_value_krw

        # 경로 문자열 — LN 스왑 경로는 노드를 명시적으로 표시
        exit_mode = path.get('global_exit_mode', 'onchain')
        if exit_mode == 'lightning_swap':
            svc_name = path.get('ln_swap_display', '')
            kyc_badge = '🔒 KYC' if path.get('ln_swap_kyc') else '🔓'
            route_str = (
                f"<b>{ex_kr}</b>→{coin}/{network}→<b>{ex_gl}</b>"
                f"→⚡LN→<b>{svc_name}</b>→개인지갑"
            )
        else:
            kyc_badge = '🔓'
            route_str = f"<b>{ex_kr}</b>→{coin}/{network}→<b>{ex_gl}</b>→개인지갑"

        lines.append(
            f"\n{medal} {route_str} [{strategy}] {kyc_badge}"
            f"\n   📥 수령: <b>{btc:.8f} BTC</b> ≈ <b>{btc_value_krw:,}원</b> (보전 {preservation_pct:.2f}%)"
            f"\n   💸 수수료: {_fmt_krw(fee_krw)} ({_fmt_pct(fee_pct)}) | 실효손실: {net_loss_krw:,}원"
        )
        for j, c in enumerate(components):
            amt = c.get('amount_krw', 0)
            rate = c.get('rate_pct')
            label = c.get('label', '')
            input_krw = c.get('input_krw')
            amount_text = c.get('amount_text', '')
            prefix = '   └' if j == len(components) - 1 else '   ├'
            rate_str = f" ({rate:.4f}%)" if rate is not None else ''
            input_str = f" of {input_krw:,}원" if input_krw and input_krw != amt else ''
            atext_str = f" [{amount_text}]" if amount_text else ''
            lines.append(f"{prefix} {label}: <b>{amt:,}원{rate_str}</b>{atext_str}{input_str}")
        # 김치 프리미엄 (경로별) — BTC 프리미엄 + USDT 프리미엄 모두 표시
        kimchi_pct = kimchi_data.get(ex_kr)
        usdt_prem = usdt_kimchi_data.get(ex_kr)
        ex_kr_name = exchange_name_map.get(ex_kr, ex_kr)
        if path.get('quote_strategy') == 'btc_direct':
            if kimchi_pct is not None:
                k_arrow = '▼' if kimchi_pct < 0 else '▲'
                contrib = f"보전율 {'+'  if kimchi_pct < 0 else '-'}{abs(kimchi_pct):.2f}%p 직접 기여"
                lines.append(
                    f"   📊 BTC 프리미엄 ({ex_kr_name}): {k_arrow}{abs(kimchi_pct):.2f}% → {contrib}"
                )
        else:
            # USDT 경유 경로: BTC 프리미엄은 무관, USDT 프리미엄은 USDT 수령량에 직접 영향
            u_price = korean_usdt_prices.get(ex_kr, 0)
            if usdt_prem is not None:
                u_arrow = '▼' if usdt_prem < 0 else '▲'
                if usdt_prem < 0:
                    usdt_contrib = f"USDT {abs(usdt_prem):.2f}% 저렴 → 더 많은 USDT 수령 (유리)"
                else:
                    usdt_contrib = f"USDT {abs(usdt_prem):.2f}% 비쌈 → 더 적은 USDT 수령 (불리)"
                lines.append(
                    f"   📊 USDT 프리미엄 ({ex_kr_name} {u_price:,.0f}원): {u_arrow}{abs(usdt_prem):.2f}% → {usdt_contrib}"
                )
            elif u_price > 0:
                # USDT 가격 데이터 있지만 kimchi 계산 실패 — 포렉스 환율로 계산됨
                lines.append(
                    f"   📊 USDT 프리미엄 ({ex_kr_name} {u_price:,.0f}원): 조회 실패 — 포렉스 환율({usd_krw_rate:,.0f}원) 기준으로 계산"
                )
            if kimchi_pct is not None:
                k_arrow = '▼' if kimchi_pct < 0 else '▲'
                lines.append(
                    f"   📊 BTC 프리미엄 ({ex_kr_name}): {k_arrow}{abs(kimchi_pct):.2f}% [역프리미엄 — BTC 글로벌가 매수로 무관]"
                )
        lines.append(_carf_line(ex_kr, ex_gl))
        lines.append(_travel_rule_line(amount_krw, ex_kr))
        from backend.app.domain.korea_exchange_registry import risk_warning_lines
        lines.extend(risk_warning_lines(ex_kr))
        lines.extend(_path_extra_lines(path, amount_krw, ref_price_krw))

    all_sorted_paths = result.get('all_paths', [])

    # BTC direct 최저 경로 (트래블룰 옵션 없을 때만 별도 참고 표시)
    btc_direct_best = next((p for p in all_sorted_paths if p.get('quote_strategy') == 'btc_direct'), None)
    if not travel_rule and mode == 'cheapest' and btc_direct_best:
        bd_ex_kr = btc_direct_best['korean_exchange']
        bd_ex_gl = btc_direct_best.get('global_exchange', '?')
        bd_btc = btc_direct_best['btc_received']
        bd_fee = btc_direct_best['total_fee_krw']
        bd_pct = btc_direct_best['fee_pct']
        bd_val = round(bd_btc * ref_price_krw) if ref_price_krw else 0
        bd_prsv = bd_val / amount_krw * 100 if amount_krw else 0
        from backend.app.domain.korea_exchange_registry import risk_warning_lines
        lines.append(
            f"\n⚠️ <b>BTC 직접 출금 참고</b> (트래블룰 지갑 등록 필요, 기본 제외)"
            f"\n   <b>{bd_ex_kr}</b>→BTC→<b>{bd_ex_gl}</b>→개인지갑 [BTC 직접] 🔓"
            f"\n   📥 {bd_btc:.8f} BTC ≈ {bd_val:,}원 (보전 {bd_prsv:.2f}%)"
            f"\n   💸 {_fmt_krw(bd_fee)} ({_fmt_pct(bd_pct)})"
            f"\n   {_travel_rule_line(amount_krw, bd_ex_kr)}"
        )
        lines.extend(risk_warning_lines(bd_ex_kr))

    # ⚡ 최저 LN 경로 (cheapest 모드에서 TOP5 미진입 시 별도 표시)
    ln_best = next((p for p in all_sorted_paths if p.get('global_exit_mode') == 'lightning_swap'), None)
    if mode != 'lightning' and ln_best and ln_best not in top10:
        lb_ex_kr = ln_best['korean_exchange']
        lb_ex_gl = ln_best.get('global_exchange', '?')
        lb_coin = ln_best['transfer_coin']
        lb_net = ln_best.get('network', '')
        lb_strat = _quote_strategy_label(ln_best.get('quote_strategy', ''))
        lb_svc = ln_best.get('ln_swap_display', '')
        lb_btc = ln_best['btc_received']
        lb_fee = ln_best['total_fee_krw']
        lb_pct = ln_best['fee_pct']
        lb_val = round(lb_btc * ref_price_krw) if ref_price_krw else 0
        lb_prsv = lb_val / amount_krw * 100 if amount_krw else 0
        kyc_b = '🔓' if not ln_best.get('ln_swap_kyc') else '🔒 KYC'
        lines.append(
            f"\n⚡ <b>LN 최저 경로</b> (온체인 자기수탁, 별도 참고)"
            f"\n   <b>{lb_ex_kr}</b>→{lb_coin}/{lb_net}→<b>{lb_ex_gl}</b>→⚡LN→<b>{lb_svc}</b>→개인지갑 [{lb_strat}] {kyc_b}"
            f"\n   📥 {lb_btc:.8f} BTC ≈ {lb_val:,}원 (보전 {lb_prsv:.2f}%)"
            f"\n   💸 {_fmt_krw(lb_fee)} ({_fmt_pct(lb_pct)})"
        )
        lines.append(_carf_line(lb_ex_kr, lb_ex_gl))
        lines.append(_travel_rule_line(amount_krw, lb_ex_kr))

    # 거래소별 요약
    summaries = result.get('exchange_summaries', {})
    if summaries:
        lines.extend(_build_exchange_summary_block(summaries))

    # FDUSD 절감 비교
    all_paths = result.get('all_paths', [])
    if top10 and top10[0].get('quote_strategy') == 'fdusd_maker':
        usdt_best = next(
            (p for p in all_paths if p.get('quote_strategy') == 'usdt_taker'
             and p.get('global_exchange') == top10[0].get('global_exchange')), None
        )
        if usdt_best:
            saving = usdt_best['total_fee_krw'] - top10[0]['total_fee_krw']
            saving_pct = round(saving / amount_krw * 100, 4)
            lines.append(f"\n💡 FDUSD 절감: <b>+{_fmt_krw(saving)} ({saving_pct}%)</b> (동일 거래소 USDT/taker 대비)")

    # Non-KYC TOP 5 섹션 (KYC 없는 스왑 서비스만 포함)
    if non_kyc_top5 != top10:  # 전체 TOP5와 다를 때만 표시
        lines.append("\n\n🔓 <b>Non-KYC 최저 경로 TOP 5</b> (추가 KYC 불필요 — Boltz/CornWallet 또는 온체인 직접)")
        for i, path in enumerate(non_kyc_top5):
            medal = medals[i] if i < len(medals) else f"{i+1}."
            ex_kr = path['korean_exchange']
            ex_gl = path.get('global_exchange', '?')
            coin = path['transfer_coin']
            network = path.get('network', '')
            strategy = _quote_strategy_label(path.get('quote_strategy', ''))
            fee_krw = path['total_fee_krw']
            fee_pct = path['fee_pct']
            btc = path['btc_received']
            btc_val = round(btc * ref_price_krw) if ref_price_krw else 0
            prsv = btc_val / amount_krw * 100 if amount_krw else 0
            em = path.get('global_exit_mode', 'onchain')
            if em == 'lightning_swap':
                svc = path.get('ln_swap_display', '')
                kyc_badge = '🔒 KYC' if path.get('ln_swap_kyc') else '🔓'
                route_str2 = f"<b>{ex_kr}</b>→{coin}/{network}→<b>{ex_gl}</b>→⚡LN→<b>{svc}</b>→개인지갑"
            else:
                kyc_badge = '🔓'
                route_str2 = f"<b>{ex_kr}</b>→{coin}/{network}→<b>{ex_gl}</b>→개인지갑"
            strategy2 = _quote_strategy_label(path.get('quote_strategy', ''))
            lines.append(
                f"\n{medal} {route_str2} [{strategy2}] {kyc_badge}"
                f"\n   📥 <b>{btc:.8f} BTC</b> ≈ <b>{btc_val:,}원</b> (보전 {prsv:.2f}%)"
                f"\n   💸 {_fmt_krw(fee_krw)} ({_fmt_pct(fee_pct)})"
            )
            lines.append(_carf_line(ex_kr, ex_gl))
            lines.append(_travel_rule_line(amount_krw, ex_kr))
            from backend.app.domain.korea_exchange_registry import risk_warning_lines
            lines.extend(risk_warning_lines(ex_kr))
            lines.extend(_path_extra_lines(path, amount_krw, ref_price_krw))
    else:
        lines.append("\n\n✅ <b>전체 TOP 5가 모두 Non-KYC 경로입니다.</b>")

    # 출처 섹션
    lines.append("\n\n📎 <b>수수료 데이터 출처</b>")
    fixed_sources = [
        ("국내 거래소 매수 수수료", "각 거래소 공식 수수료 (빗썸 0.04% / 업비트 0.05% / 코빗 0.2% / 코인원 0.1%)",
         "각 거래소 공식 홈페이지"),
        ("국내 USDT 출금 수수료", "실시간 API / 페이지 스크래핑 (TRC20: 빗썸·업비트 0원, 코빗 1 USDT, 코인원 2 USDT)",
         "각 거래소 수수료 페이지"),
        ("Bybit 출금 수수료", "공식 도움말 공개 수치 (BTC 0.0002 / USDT TRC20 1.0)",
         "https://www.bybit.com/en/help-center/article/Withdrawal-Fees"),
        ("각 글로벌 거래소 BTC 출금 수수료", "실시간 API (Binance/OKX/Bitget) + 공개 수치 (Bybit/Coinbase/Kraken)",
         "각 거래소 출금 API"),
    ]
    for label, src, url in fixed_sources:
        lines.append(f"• <b>{label}</b>: {src}")
        lines.append(f"  └ {url}")

    for sd in source_details:
        lines.append(f"• <b>{sd['label']}</b>: {sd['value']}")
        lines.append(f"  └ 출처: {sd['source']}")
        if sd.get('url'):
            lines.append(f"  └ URL: {sd['url']}")

    # CARF 범례
    lines.append(
        "\n📋 <b>CARF 범례</b>\n"
        "🔴 자동 교환 = 한국 국세청이 해당 거래소 거래내역 자동 수신 (2026년 데이터부터)\n"
        "🟡 미교환 = 해당 거래소 소재국이 아직 CARF 미시행 (교환 시작 예정 연도 표시)\n"
        "출처: OECD CARF 2025 Monitoring Update / 한국 기재부 2025-09 고시"
    )

    if errors or warnings:
        msgs = errors + warnings
        lines.append(f"\n⚠️ {' | '.join(msgs)}")

    lines.append(f"\n🕐 <b>조회시각</b>: {now_kst}")
    return '\n'.join(lines)


def run(amount_krw: int = 1_000_000, global_exchange: str = 'all', include_fdusd: bool = False, mode: str = 'cheapest', travel_rule: bool = False) -> dict:
    from backend.app.domain.paths_dynamic import (
        find_cheapest_path_dynamic,
        find_cheapest_path_all_exchanges,
    )
    from backend.app.services.promo_scraper import fetch_promo_context

    logger.info('프로모션 컨텍스트 수집 중...')
    promo_ctx = fetch_promo_context()
    logger.info('프로모션 수집 완료 — overrides: %d, errors: %s',
                len(promo_ctx.fee_overrides), promo_ctx.errors)

    if global_exchange == 'all':
        logger.info('전체 거래소 병렬 탐색 중... (amount=%d, fdusd=%s)', amount_krw, include_fdusd)
        result = find_cheapest_path_all_exchanges(amount_krw=amount_krw, promo_ctx=promo_ctx,
                                                   include_fdusd=include_fdusd)
        build_msg = lambda r, a: _build_telegram_message_all(r, a, mode=mode, travel_rule=travel_rule)
    else:
        logger.info('단일 거래소 탐색 중... (amount=%d, exchange=%s)', amount_krw, global_exchange)
        result = find_cheapest_path_dynamic(amount_krw=amount_krw,
                                            global_exchange=global_exchange,
                                            promo_ctx=promo_ctx,
                                            include_fdusd=include_fdusd)
        build_msg = _build_telegram_message

    if 'error' in result:
        logger.error('경로 계산 실패: %s', result['error'])
        return result

    msg = build_msg(result, amount_krw)
    logger.info('\n--- 텔레그램 메시지 ---\n%s\n---', msg)

    sent = send_telegram(msg)
    result['telegram_sent'] = sent
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description='동적 BTC 경로 알림')
    parser.add_argument('--amount', type=int, default=1_000_000, help='투자 금액 (KRW)')
    parser.add_argument('--exchange', default='all', help='글로벌 거래소 (기본: all)')
    parser.add_argument('--no-fdusd', action='store_true', help='FDUSD maker 경로 제외 (기본: 포함)')
    parser.add_argument('--mode', choices=['cheapest', 'lightning'], default='cheapest',
                        help='cheapest: 전체 최저 수수료 순 (기본) | lightning: LN 출금 경로만')
    parser.add_argument('--travel-rule', action='store_true',
                        help='BTC 직접 출금 경로 포함 (트래블룰 지갑 등록 필요, 기본: 제외)')
    args = parser.parse_args()

    result = run(amount_krw=args.amount, global_exchange=args.exchange,
                 include_fdusd=not args.no_fdusd, mode=args.mode,
                 travel_rule=args.travel_rule)

    if 'error' in result:
        print(f'오류: {result["error"]}', file=sys.stderr)
        sys.exit(1)

    best = result.get('best_path', {})
    print(
        f"\n✅ 최적 경로: {best.get('korean_exchange')} → "
        f"{best.get('quote_strategy')} → "
        f"총 {best.get('total_fee_krw'):,}원 ({best.get('fee_pct')}%)"
    )
    print(f"텔레그램 전송: {'성공' if result.get('telegram_sent') else '실패'}")


if __name__ == '__main__':
    main()
