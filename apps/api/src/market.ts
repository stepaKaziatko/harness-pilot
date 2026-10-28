export interface Instrument {
  symbol: string;
  name: string;
  /** Previous close and the centre of the simulated price, in cents. */
  baseCents: number;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  symbol: string | null;
}

export interface MarketStore {
  instruments(): Promise<Instrument[]>;
  /** Newest first. */
  news(limit: number): Promise<NewsItem[]>;
}
