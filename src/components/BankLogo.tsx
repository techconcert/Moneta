import React, { useState } from 'react';
import { AccountType } from '../types';
import { Landmark, CreditCard, PiggyBank, Wallet, TrendingUp, Building2 } from 'lucide-react';

interface BankLogoProps {
  institutionName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: string;
  accountType?: AccountType;
}

export function getInstitutionDomain(institutionName: string): string {
  const name = (institutionName || '').toLowerCase().trim();
  if (name.includes('computershare')) return 'computershare.com';
  if (name.includes('morgan stanley') || name.includes('morganstanley')) return 'morganstanley.com';
  if (name.includes('american express') || name.includes('amex')) return 'americanexpress.com';
  if (name.includes('chase') || name.includes('jpmorgan')) return 'chase.com';
  if (name.includes('america') || name.includes('bofa')) return 'bankofamerica.com';
  if (name.includes('wells fargo') || name.includes('wellsfargo')) return 'wellsfargo.com';
  if (name.includes('capital one') || name.includes('capitalone')) return 'capitalone.com';
  if (name.includes('fidelity')) return 'fidelity.com';
  if (name.includes('nubank') || name.includes('nu bank') || name.includes('nu pagamentos')) return 'nubank.com.br';
  if (name.includes('itaú') || name.includes('itau')) return 'itau.com.br';
  if (name.includes('bradesco')) return 'bradesco.com.br';
  if (name.includes('brasil') || name.includes('banco do brasil') || name.includes('bb ')) return 'bb.com.br';
  if (name.includes('santander')) return 'santander.com';
  if (name.includes('caixa')) return 'caixa.gov.br';
  if (name.includes('inter')) return 'inter.co';
  if (name.includes('c6')) return 'c6bank.com.br';
  if (name.includes('btg')) return 'btgpactual.com';
  if (name.includes('mercado pago') || name.includes('mercadopago')) return 'mercadopago.com';
  if (name.includes('citi') || name.includes('citibank')) return 'citibank.com';
  if (name.includes('schwab')) return 'schwab.com';
  if (name.includes('wise') || name.includes('transferwise')) return 'wise.com';
  if (name.includes('vanguard')) return 'vanguard.com';
  if (name.includes('revolut')) return 'revolut.com';
  if (name.includes('ally')) return 'ally.com';
  if (name.includes('goldman') || name.includes('marcus')) return 'marcus.com';
  if (name.includes('monzo')) return 'monzo.com';
  if (name.includes('starling')) return 'starlingbank.com';
  if (name.includes('n26')) return 'n26.com';
  if (name.includes('chime')) return 'chime.com';
  if (name.includes('sofi')) return 'sofi.com';
  if (name.includes('robinhood')) return 'robinhood.com';
  if (name.includes('pnc')) return 'pnc.com';
  if (name.includes('us bank') || name.includes('usbank')) return 'usbank.com';
  if (name.includes('td bank') || name.includes('tdbank')) return 'td.com';
  if (name.includes('barclays')) return 'barclays.co.uk';
  if (name.includes('hsbc')) return 'hsbc.com';

  const clean = name.replace(/[^a-z0-9]/g, '');
  return clean ? `${clean}.com` : 'bankofamerica.com';
}

export function getBankLogoUrl(institutionName: string): string {
  const domain = getInstitutionDomain(institutionName);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

export const BankLogo: React.FC<BankLogoProps> = ({
  institutionName,
  size = 'md',
  className = '',
  color,
  accountType,
}) => {
  const [hasError, setHasError] = useState(false);
  const logoUrl = getBankLogoUrl(institutionName);

  React.useEffect(() => {
    setHasError(false);
  }, [logoUrl]);

  const containerSizes = {
    xs: 'w-6 h-6 rounded-md text-[10px]',
    sm: 'w-7 h-7 rounded-lg text-xs',
    md: 'w-10 h-10 rounded-xl text-sm',
    lg: 'w-12 h-12 rounded-2xl text-base',
    xl: 'w-14 h-14 rounded-2xl text-lg',
  };

  const imgContainerSizes = {
    xs: 'w-6 h-6 rounded-md p-0.5',
    sm: 'w-7 h-7 rounded-lg p-0.5',
    md: 'w-10 h-10 rounded-xl p-1',
    lg: 'w-12 h-12 rounded-2xl p-1.5',
    xl: 'w-14 h-14 rounded-2xl p-2',
  };

  const initials = (institutionName || 'Bank')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      {!hasError ? (
        <div className={`flex items-center justify-center bg-white border border-slate-200 shadow-xs shrink-0 overflow-hidden ${imgContainerSizes[size]} ${className}`}>
          <img
            src={logoUrl}
            alt={institutionName}
            onError={() => setHasError(true)}
            className="w-full h-full object-contain rounded-md"
            loading="lazy"
          />
        </div>
      ) : (
        <div
          className={`flex items-center justify-center text-white font-extrabold shadow-sm shrink-0 ${containerSizes[size]} ${className}`}
          style={{ backgroundColor: color || '#3B82F6' }}
        >
          {initials}
        </div>
      )}

      {accountType && (
        <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-xs border border-slate-200" title={accountType}>
          {accountType === 'checking' && <Landmark className="w-2.5 h-2.5 text-blue-600" />}
          {accountType === 'savings' && <PiggyBank className="w-2.5 h-2.5 text-emerald-600" />}
          {accountType === 'credit_card' && <CreditCard className="w-2.5 h-2.5 text-purple-600" />}
          {accountType === 'investment' && <TrendingUp className="w-2.5 h-2.5 text-sky-600" />}
          {accountType === 'loan' && <Wallet className="w-2.5 h-2.5 text-amber-600" />}
        </div>
      )}
    </div>
  );
};
