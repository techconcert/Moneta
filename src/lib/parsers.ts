import { Transaction, Currency, IntegrationProvider } from '../types';

export interface ParsedImportResult {
  transactions: Omit<Transaction, 'id' | 'accountId' | 'accountName'>[];
  detectedCurrency: Currency;
  fileType: 'csv' | 'ofx' | 'ofc' | 'olx';
  totalCount: number;
}

/**
 * Parses raw text from CSV, OFX, OFC, QFX or OLX financial statement export
 */
export function parseFinancialFile(
  fileContent: string,
  fileName: string,
  defaultAccountCurrency: Currency = 'USD'
): ParsedImportResult {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  if (
    extension === 'ofx' ||
    extension === 'qfx' ||
    extension === 'ofc' ||
    extension === 'olx' ||
    fileContent.includes('<OFX>') ||
    fileContent.includes('<OFC>')
  ) {
    return parseOFXorOLX(fileContent, defaultAccountCurrency, extension);
  }

  return parseCSV(fileContent, defaultAccountCurrency);
}

function parseCSV(content: string, defaultCurrency: Currency): ParsedImportResult {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length < 2) {
    return { transactions: [], detectedCurrency: defaultCurrency, fileType: 'csv', totalCount: 0 };
  }

  // Parse header line
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : headerLine.includes('\t') ? '\t' : ',';
  const headers = headerLine.split(delimiter).map(h => cleanString(h).toLowerCase());

  // Normalize header strings without accents for index lookup
  const normHeaders = headers.map(h =>
    h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  );

  // Detect column indices
  let dateIdx = normHeaders.findIndex(h => h.includes('date') || h.includes('data') || h === 'dt');
  
  let descIdx = normHeaders.findIndex(
    h =>
      h.includes('desc') ||
      h.includes('memo') ||
      h.includes('payee') ||
      h.includes('title') ||
      h.includes('historico') ||
      h.includes('estabelecimento') ||
      h.includes('favorecido') ||
      h.includes('merchant') ||
      h.includes('narrative') ||
      h.includes('detalhe') ||
      h.includes('nome') ||
      h === 'to' ||
      h === 'for'
  );

  let amountIdx = normHeaders.findIndex(
    h => h.includes('amount') || h.includes('valor') || h.includes('quantia') || h === 'total' || h === 'val'
  );
  let debitIdx = normHeaders.findIndex(h => h.includes('debit') || h.includes('saida') || h.includes('debito'));
  let creditIdx = normHeaders.findIndex(h => h.includes('credit') || h.includes('entrada') || h.includes('credito'));
  let categoryIdx = normHeaders.findIndex(h => h.includes('cat'));
  let currencyIdx = normHeaders.findIndex(h => h.includes('curr') || h.includes('moeda'));

  if (dateIdx === -1) dateIdx = 0;

  // Smart fallback for description column if not explicitly matched by header
  if (descIdx === -1) {
    // Inspect up to 5 data rows to find the text column
    const sampleRows = lines.slice(1, 6).map(l => parseCSVRow(l, delimiter));
    let bestCol = -1;
    let maxAvgLen = 0;

    for (let col = 0; col < (sampleRows[0]?.length || 0); col++) {
      if (col === dateIdx || col === amountIdx || col === debitIdx || col === creditIdx) continue;
      let totalLen = 0;
      let count = 0;
      for (const r of sampleRows) {
        if (r[col] && isNaN(Number(r[col].replace(/[,$]/g, '')))) {
          totalLen += r[col].length;
          count++;
        }
      }
      if (count > 0) {
        const avg = totalLen / count;
        if (avg > maxAvgLen) {
          maxAvgLen = avg;
          bestCol = col;
        }
      }
    }
    descIdx = bestCol !== -1 ? bestCol : dateIdx === 0 ? 1 : 0;
  }

  if (amountIdx === -1 && debitIdx === -1) amountIdx = 2;

  const transactions: Omit<Transaction, 'id' | 'accountId' | 'accountName'>[] = [];
  let detectedCurrency = defaultCurrency;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i], delimiter);
    if (row.length <= Math.max(dateIdx, descIdx)) continue;

    const rawDate = row[dateIdx] || '';
    const rawDesc = cleanAccentedText(row[descIdx] || 'Imported Transaction');
    let rawAmount = 0;

    if (amountIdx !== -1 && row[amountIdx]) {
      rawAmount = parseFinancialAmount(row[amountIdx]);
    } else if (debitIdx !== -1 || creditIdx !== -1) {
      const debitVal = debitIdx !== -1 && row[debitIdx] ? parseFinancialAmount(row[debitIdx]) : 0;
      const creditVal = creditIdx !== -1 && row[creditIdx] ? parseFinancialAmount(row[creditIdx]) : 0;
      rawAmount = creditVal > 0 ? creditVal : -Math.abs(debitVal);
    }

    if (isNaN(rawAmount) || rawAmount === 0) continue;

    let rowCurrency = defaultCurrency;
    if (currencyIdx !== -1 && row[currencyIdx]) {
      const c = row[currencyIdx].toUpperCase().trim();
      if (['USD', 'BRL', 'EUR', 'GBP'].includes(c)) {
        rowCurrency = c as Currency;
        detectedCurrency = rowCurrency;
      }
    } else if (lines[i].includes('R$') || lines[i].includes('BRL')) {
      rowCurrency = 'BRL';
      detectedCurrency = 'BRL';
    }

    const isoDate = normalizeDate(rawDate);
    const category = categoryIdx !== -1 && row[categoryIdx] ? cleanAccentedText(row[categoryIdx]) : guessCategory(rawDesc);

    transactions.push({
      date: isoDate,
      description: cleanString(rawDesc),
      originalDescription: rawDesc,
      amount: rawAmount,
      currency: rowCurrency,
      category,
      tags: ['imported', 'csv'],
      pending: false,
      provider: 'file_import',
    });
  }

  return {
    transactions,
    detectedCurrency,
    fileType: 'csv',
    totalCount: transactions.length,
  };
}

function parseOFXorOLX(content: string, defaultCurrency: Currency, extension?: string): ParsedImportResult {
  const transactions: Omit<Transaction, 'id' | 'accountId' | 'accountName'>[] = [];
  let detectedCurrency = defaultCurrency;

  if (content.includes('<CURDEF>BRL</CURDEF>') || content.includes('BRL')) {
    detectedCurrency = 'BRL';
  } else if (content.includes('<CURDEF>USD</CURDEF>') || content.includes('USD')) {
    detectedCurrency = 'USD';
  } else if (content.includes('<CURDEF>EUR</CURDEF>') || content.includes('EUR')) {
    detectedCurrency = 'EUR';
  } else if (content.includes('<CURDEF>GBP</CURDEF>') || content.includes('GBP')) {
    detectedCurrency = 'GBP';
  }

  // Determine file type tag
  let fileType: 'ofx' | 'ofc' | 'olx' = 'ofx';
  if (extension === 'ofc' || content.includes('<OFC>') || content.includes('OFCHEADER')) {
    fileType = 'ofc';
  } else if (extension === 'olx' || content.includes('OLX')) {
    fileType = 'olx';
  }

  // Regex extract <STMTTRN> or OFC transactions
  const trnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>|$))/gi;
  let match: RegExpExecArray | null;

  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];
    const amountMatch = block.match(/<TRNAMT>([\d.-]+)/i) || block.match(/<AMOUNT>([\d.-]+)/i);
    const dateMatch = block.match(/<DTPOSTED>(\d{8})/i) || block.match(/<DTPOSTED>(\d{4}-\d{2}-\d{2})/i);
    const nameMatch = block.match(/<NAME>([^<\r\n]+)/i) || block.match(/<MEMO>([^<\r\n]+)/i) || block.match(/<PAYEE>([^<\r\n]+)/i);
    const fitidMatch = block.match(/<FITID>([^<\r\n]+)/i) || block.match(/<CHKNUM>([^<\r\n]+)/i);

    if (amountMatch) {
      const amount = parseFloat(amountMatch[1]);
      let rawDate = dateMatch ? dateMatch[1].replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      if (rawDate.length >= 8) {
        rawDate = rawDate.slice(0, 8);
      }
      const formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      const rawDescription = nameMatch ? nameMatch[1].trim() : `${fileType.toUpperCase()} Transaction`;
      const description = cleanAccentedText(rawDescription);

      transactions.push({
        date: formattedDate,
        description: cleanString(description),
        originalDescription: description,
        amount,
        currency: detectedCurrency,
        category: guessCategory(description),
        tags: ['imported', fileType],
        pending: false,
        provider: 'file_import',
        externalId: fitidMatch ? fitidMatch[1].trim() : undefined,
      });
    }
  }

  return {
    transactions,
    detectedCurrency,
    fileType,
    totalCount: transactions.length,
  };
}

/**
 * Handles decoding/repair of HTML entities & corrupted characters from non-UTF8 encoded exports
 */
export function cleanAccentedText(str: string): string {
  if (!str) return '';

  let res = str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Fix common replacement character / Windows-1252 artifact mis-encodings in Latin bank statements
  res = res
    .replace(/Poupan\uFFFD a|Poupana/gi, 'Poupança')
    .replace(/F\uFFFD cil|Fcil/gi, 'Fácil')
    .replace(/Guimar\uFFFD es|Guimares/gi, 'Guimarães')
    .replace(/D\uFFFD bito|Dbito/gi, 'Débito')
    .replace(/Cr\uFFFD dito|Crdito/gi, 'Crédito')
    .replace(/Aplica\uFFFD \uFFFD o|Aplica\uFFFD o|Aplicao/gi, 'Aplicação')
    .replace(/Aplica\uFFFD \uFFFD es|Aplicaes/gi, 'Aplicações')
    .replace(/Transfer\uFFFD ncia|Transferncia/gi, 'Transferência')
    .replace(/Ita\uFFFD |Itau /gi, 'Itaú ')
    .replace(/Cart\uFFFD o|Cartao/gi, 'Cartão')
    .replace(/Servi\uFFFD o|Servio/gi, 'Serviço')
    .replace(/S\uFFFD o Paulo/gi, 'São Paulo')
    .replace(/Promo\uFFFD \uFFFD o|Promocao/gi, 'Promoção');

  return res.trim();
}

/**
 * Smart amount parser supporting US (1,250.00) and BR/EU (1.250,00 or -120,99) number formats
 */
export function parseFinancialAmount(rawStr: string): number {
  if (!rawStr) return 0;
  let s = rawStr.replace(/[R$\s€£]/gi, '').trim();

  // If format contains both . and ,
  if (s.includes('.') && s.includes(',')) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      // European/BR format e.g. 32.189,33 -> 32189.33
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US format e.g. 32,189.33 -> 32189.33
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Only comma e.g. -120,99 -> -120.99
    s = s.replace(',', '.');
  }

  // Strip non-numeric except minus and dot
  s = s.replace(/[^0-9.-]/g, '');
  return parseFloat(s) || 0;
}

function parseCSVRow(rowText: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rowText.length; i++) {
    const char = rowText[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().split('T')[0];
  const cleaned = raw.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }

  // DD/MM/YYYY or MM/DD/YYYY
  const parts = cleaned.split(/[/.-]/);
  if (parts.length >= 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const p3 = parts[2].length === 2 ? `20${parts[2]}` : parts[2];

    if (p2 > 12 && p1 <= 12) {
      // MM/DD/YYYY format (e.g. US statements like 07/28/2026)
      return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    // DD/MM/YYYY format (e.g. Brazilian / European statements like 01/07/2026, 28/07/2026)
    return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
  }

  return new Date().toISOString().split('T')[0];
}

function cleanString(str: string): string {
  return str.replace(/["']/g, '').trim();
}

/**
 * Checks if a transaction description represents an internal bank sweep / overdraft redemption
 * (e.g., Banco do Brasil "BB Rende Fácil" or "Resgate Poupança")
 */
export function isAutomaticSweepTransfer(desc: string): boolean {
  const lower = desc.toLowerCase();
  return (
    lower.includes('rende facil') ||
    lower.includes('rende fácil') ||
    lower.includes('resgate poupanca') ||
    lower.includes('resgate poupança') ||
    lower.includes('aplicacao poupanca') ||
    lower.includes('aplicação poupança') ||
    lower.includes('resgate automatico') ||
    lower.includes('resgate automático') ||
    lower.includes('automatic sweep') ||
    lower.includes('overdraft sweep')
  );
}

export function guessCategory(desc: string): string {
  const lower = desc.toLowerCase();

  if (isAutomaticSweepTransfer(desc)) {
    return 'Internal Transfer';
  }

  if (
    lower.includes('uber') ||
    lower.includes('lyft') ||
    lower.includes('postes') ||
    lower.includes('gas') ||
    lower.includes('shell') ||
    lower.includes('ipiranga') ||
    lower.includes('estapar')
  ) {
    return 'Transportation';
  }
  if (
    lower.includes('market') ||
    lower.includes('superm') ||
    lower.includes('carrefour') ||
    lower.includes('pao de acucar') ||
    lower.includes('pão de açúcar') ||
    lower.includes('whole foods') ||
    lower.includes('trader joe') ||
    lower.includes('albertsons') ||
    lower.includes('target') ||
    lower.includes('walmart')
  ) {
    return 'Groceries';
  }
  if (
    lower.includes('starbucks') ||
    lower.includes('coffee') ||
    lower.includes('cafe') ||
    lower.includes('café') ||
    lower.includes('restaurant') ||
    lower.includes('burger') ||
    lower.includes('ifood') ||
    lower.includes('door dash') ||
    lower.includes('padaria') ||
    lower.includes('delicates') ||
    lower.includes('deli')
  ) {
    return 'Restaurants & Dining';
  }
  if (
    lower.includes('netflix') ||
    lower.includes('spotify') ||
    lower.includes('hbo') ||
    lower.includes('disney') ||
    lower.includes('prime') ||
    lower.includes('apple.com') ||
    lower.includes('globoplay')
  ) {
    return 'Subscriptions & Media';
  }
  if (
    lower.includes('amazon') ||
    lower.includes('mercadolibre') ||
    lower.includes('mercado livre') ||
    lower.includes('shopee') ||
    lower.includes('zara') ||
    lower.includes('magalu')
  ) {
    return 'Shopping';
  }
  if (
    lower.includes('toyota motor credit') ||
    lower.includes('toyota') ||
    lower.includes('salary') ||
    lower.includes('payroll') ||
    lower.includes('pagamento') ||
    lower.includes('salario') ||
    lower.includes('salário') ||
    lower.includes('stripe') ||
    lower.includes('deposit')
  ) {
    return 'Income & Salary';
  }
  if (
    lower.includes('light') ||
    lower.includes('comcast') ||
    lower.includes('verizon') ||
    lower.includes('enel') ||
    lower.includes('sabesp') ||
    lower.includes('rent') ||
    lower.includes('aluguel')
  ) {
    return 'Bills & Utilities';
  }
  if (
    lower.includes('pharmacy') ||
    lower.includes('drogaria') ||
    lower.includes('drogasil') ||
    lower.includes('cvs') ||
    lower.includes('walgreens') ||
    lower.includes('gym') ||
    lower.includes('smartfit')
  ) {
    return 'Health & Fitness';
  }
  return 'Uncategorized';
}

