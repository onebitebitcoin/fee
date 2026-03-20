import { Building2, Zap } from 'lucide-react';
import { useState } from 'react';

export function ServiceLogo({
  name,
  variant,
  className = 'h-5 w-5',
}: {
  name: string;
  variant: 'exchange' | 'lightning';
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const logoName = name.toLowerCase().replace(/\s+/g, '');

  if (!imgError) {
    return (
      <img
        src={`/logos/${logoName}.png`}
        alt={name}
        width={20}
        height={20}
        className={`${className} shrink-0 rounded-full bg-dark-500 object-contain`}
        onError={() => setImgError(true)}
      />
    );
  }

  return variant === 'lightning' ? (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-400 ${className}`}>
      <Zap size={12} />
    </span>
  ) : (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-dark-200 text-bnb-muted ${className}`}>
      <Building2 size={12} />
    </span>
  );
}

export function ServiceLabel({
  name,
  label,
  variant,
  textClassName = 'text-bnb-text',
  logoClassName,
}: {
  name: string;
  label?: string;
  variant: 'exchange' | 'lightning';
  textClassName?: string;
  logoClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${textClassName}`}>
      <ServiceLogo name={name} variant={variant} className={logoClassName} />
      <span>{label ?? name}</span>
    </span>
  );
}
