export type DealAmount = {
  amountCents: number | null;
  currency: string | null;
};

export type BoardDeal = {
  id: string;
  title: string;
  contact: { id: string; name: string };
  stageId: string;
  amount: { centavos: number; moneda: string } | null;
};

export type CurrencyTotal = {
  currency: string;
  amountCents: number;
  deals: number;
};

export function totalizarTratosPorMoneda(
  deals: readonly DealAmount[],
  monedaPredeterminada: string
): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const deal of deals) {
    if (deal.amountCents === null) continue;
    const currency = deal.currency ?? monedaPredeterminada;
    const total = totals.get(currency) ?? { currency, amountCents: 0, deals: 0 };
    total.amountCents += deal.amountCents;
    total.deals += 1;
    totals.set(currency, total);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
