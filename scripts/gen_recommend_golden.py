#!/usr/bin/env python3
"""추천/필터 로직 golden 회귀 기준 생성기.

고정 fixture(cheapestAll.fixture.json)를 입력으로,
프론트엔드 recommend.ts와 동일한 로직(독립 구현 = oracle)을 적용해
모든 필터 시나리오의 기대 출력 + 전체 경로 내부 일관성 요약을 golden JSON으로 저장한다.

이 oracle은 Playwright로 실제 UI와 27/27 시나리오 일치가 확인된 구현이다.
Vitest 테스트(recommend.test.ts)는 실제 TS 로직을 이 golden과 대조한다.

재생성:
  python3 scripts/gen_recommend_golden.py
"""
from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FIX_DIR = os.path.join(HERE, '..', 'frontend', 'src', 'pages', 'explorer', '__fixtures__')
FIXTURE = os.path.join(FIX_DIR, 'cheapestAll.fixture.json')
GOLDEN = os.path.join(FIX_DIR, 'recommend.golden.json')

# constants.GLOBAL_EXCHANGES 순서 (flatten 순서에 영향 없음 — dedup/sort가 결정적이라 무관하지만 명시)
GLOBAL_ORDER = ['binance', 'okx', 'bybit', 'bitget', 'kraken', 'coinbase', 'gate']
AMOUNT_KRW = 1_000_000
SATS = 100_000_000


def flatten(by_global):
    out = []
    # fixture 키 순서 그대로 평탄화 (dedup/sort 결정적이라 순서 무관)
    for g, d in by_global.items():
        if not isinstance(d, dict) or d.get('error'):
            continue
        for p in d.get('all_paths', []):
            q = dict(p); q['_g'] = g
            out.append(q)
    return out


def route_key(p):
    is_usdt = p.get('transfer_coin') == 'USDT'
    is_vg = (p.get('route_variant') or '').endswith('via_global')
    coin = 'USDT' if is_usdt else ('BTC_GLOBAL' if is_vg else 'BTC_DIRECT')
    gp = p['_g'] if (is_usdt or is_vg) else ''
    npart = '' if is_usdt else p.get('network')
    return f"{p['korean_exchange']}|{coin}|{gp}|{npart}|{p.get('global_exit_mode')}|{p.get('lightning_exit_provider') or ''}"


def dedup_sort(all_paths):
    best = {}
    for p in all_paths:
        k = route_key(p)
        cur = best.get(k)
        if not cur or (p.get('btc_received') or 0) > (cur.get('btc_received') or 0):
            best[k] = p
    return sorted(best.values(), key=lambda p: ((p.get('total_fee_krw') or 0), -(p.get('btc_received') or 0)))


def apply_filter(paths, f):
    exExch = set(f['excludeExchanges']); exGlobal = set(f['excludeGlobalExchanges'])
    exSvc = set(f['excludeServices'])
    out = []
    for p in paths:
        if (p.get('destination') or 'personal') != f['destinationFilter']:
            continue
        if p['korean_exchange'] in exExch:
            continue
        is_usdt = p.get('transfer_coin') == 'USDT'
        is_vg = (p.get('route_variant') or '').endswith('via_global')
        if (is_usdt or is_vg) and p['_g'] in exGlobal:
            continue
        if p.get('path_type') == 'lightning_exit':
            if f['excludeLightning']:
                continue
            svc = p.get('lightning_exit_provider')
            if svc and svc in exSvc:
                continue
        else:
            if f['excludeOnchain']:
                continue
        if f['excludeDisabled'] and p.get('disabled'):
            continue
        out.append(p)
    return out


def empty_filter(**over):
    base = {
        'destinationFilter': 'personal',
        'excludeExchanges': [], 'excludeGlobalExchanges': [], 'excludeServices': [],
        'excludeOnchain': False, 'excludeLightning': False, 'excludeDisabled': False,
    }
    base.update(over)
    return base


def main():
    d = json.load(open(FIXTURE))
    bg = d['by_global']
    dedup = dedup_sort(flatten(bg))

    avail_exch = sorted({p['korean_exchange'] for p in dedup})
    avail_global = sorted({p['_g'] for p in dedup
                           if p.get('transfer_coin') == 'USDT' or (p.get('route_variant') or '').endswith('via_global')})
    kyc_services = sorted({p.get('lightning_exit_provider') for p in dedup
                           if p.get('exit_service_kyc_status') == 'kyc' and p.get('lightning_exit_provider')
                           and p.get('lightning_exit_provider') != '__direct__'})

    # ── 시나리오 정의 (이름 → 필터) ──
    scenarios = []

    def add(name, f):
        scenarios.append((name, f))

    add('default(personal)', empty_filter())
    add('default(lightning_wallet)', empty_filter(destinationFilter='lightning_wallet'))
    add('preset:KYC 라이트닝 제외', empty_filter(excludeServices=list(kyc_services)))
    add('preset:라이트닝 제외', empty_filter(excludeLightning=True))
    for kor, glob in [('bithumb', 'binance'), ('bithumb', 'okx'), ('upbit', 'binance'), ('upbit', 'okx')]:
        add(f'preset:{kor}→{glob}', empty_filter(
            excludeExchanges=[e for e in avail_exch if e != kor],
            excludeGlobalExchanges=[e for e in avail_global if e != glob]))
    add('toggle:온체인제외', empty_filter(excludeOnchain=True))
    add('toggle:비활성화제외', empty_filter(excludeDisabled=True))
    for e in avail_exch:
        add(f'exKorean:{e}', empty_filter(excludeExchanges=[e]))
    for e in avail_global:
        add(f'exGlobal:{e}', empty_filter(excludeGlobalExchanges=[e]))
    for s in ['Boltz', 'Coinos', 'Oksusu', 'Strike', 'WalletOfSatoshi']:
        add(f'exService:{s}', empty_filter(excludeServices=[s]))

    out_scenarios = []
    for name, f in scenarios:
        res = apply_filter(dedup, f)
        top = res[0] if res else None
        out_scenarios.append({
            'name': name,
            'filter': f,
            'expected': {
                'count': len(res),
                'topRouteKey': route_key(top) if top else None,
                'topFeeKrw': (top.get('total_fee_krw') if top else None),
                'topSats': (round((top.get('btc_received') or 0) * SATS) if top else None),
            },
        })

    # ── 전체 dedup 정렬 순서 (default 두 종착지) ──
    def order_dump(dest):
        return [{
            'routeKey': route_key(p),
            'totalFeeKrw': p.get('total_fee_krw'),
            'sats': round((p.get('btc_received') or 0) * SATS),
        } for p in dedup if (p.get('destination') or 'personal') == dest]

    golden = {
        '_comment': 'recommend.ts golden 회귀 기준. scripts/gen_recommend_golden.py로 재생성. '
                    'fixture: cheapestAll.fixture.json (amount_krw=1,000,000 고정). '
                    'oracle는 Playwright로 실제 UI와 27/27 시나리오 일치 확인됨.',
        'amountKrw': AMOUNT_KRW,
        'availableExchanges': avail_exch,
        'availableGlobalExchanges': avail_global,
        'kycServices': kyc_services,
        'dedupCount': len(dedup),
        'scenarios': out_scenarios,
        'order': {
            'personal': order_dump('personal'),
            'lightning_wallet': order_dump('lightning_wallet'),
        },
    }
    with open(GOLDEN, 'w') as fh:
        json.dump(golden, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(f"golden written: {GOLDEN}")
    print(f"  scenarios: {len(out_scenarios)}, dedup: {len(dedup)}, "
          f"personal: {len(golden['order']['personal'])}, ln_wallet: {len(golden['order']['lightning_wallet'])}")


if __name__ == '__main__':
    main()
