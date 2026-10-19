import { apiRequest } from './client';

export interface MarketQuote {
  symbol: 'NIFTY 50' | 'GOLD / 10G' | 'SILVER / KG';
  price: number;
  change_percent: number;
  currency: 'INR';
  unit: string;
  market_symbol: string;
  updated_at: string;
  source: 'Yahoo Finance';
}

export interface MarketQuotesResponse {
  quotes: MarketQuote[];
  fetched_at: string;
  is_stale: boolean;
}

export function getMarketQuotes(): Promise<MarketQuotesResponse> {
  return apiRequest<MarketQuotesResponse>('/market/quotes');
}
