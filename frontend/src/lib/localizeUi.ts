import type { KycStatus } from '../types';

const NETWORK_LABEL_MAP: Record<string, string> = {
  'lightning network': '라이트닝 네트워크',
  lightning: '라이트닝',
  'on-chain': '온체인',
  onchain: '온체인',
  bitcoin: '비트코인',
};

const KYC_LABEL_MAP: Record<Exclude<KycStatus, null>, string> = {
  kyc: 'KYC',
  non_kyc: 'NON-KYC',
  mixed: 'MIXED',
};

export function localizeUiLabel(value: string | null | undefined): string {
  if (!value) return '';
  const direct = NETWORK_LABEL_MAP[value.toLowerCase()];
  if (direct) return direct;

  return value
    .replace(/Lightning Network/gi, '라이트닝 네트워크')
    .replace(/Lightning/gi, '라이트닝')
    .replace(/On-chain/gi, '온체인')
    .replace(/Bitcoin/gi, '비트코인');
}

export function localizeKycLabel(status: KycStatus | undefined): string | null {
  if (!status) return null;
  return KYC_LABEL_MAP[status];
}
