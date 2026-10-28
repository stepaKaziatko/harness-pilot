export type Side = 'buy' | 'sell';

export interface Operation {
  id: number;
  symbol: string;
  side: Side;
  quantity: number;
  priceCents: number;
  totalCents: number;
  createdAt: string;
}

export interface Holding {
  symbol: string;
  quantity: number;
}

export interface OrderInput {
  userId: string;
  symbol: string;
  side: Side;
  quantity: number;
  /** The server-side execution price; the client never supplies one. */
  priceCents: number;
}

export type OrderRejection = 'INSUFFICIENT_FUNDS' | 'INSUFFICIENT_POSITION';

/** Thrown by a store when an order is valid but cannot be filled; the database is left unchanged. */
export class OrderRejectedError extends Error {
  readonly code: OrderRejection;
  constructor(code: OrderRejection) {
    super(code);
    this.name = 'OrderRejectedError';
    this.code = code;
  }
}

export interface PortfolioStore {
  holdings(userId: string): Promise<{ cashCents: number; positions: Holding[] }>;
  watchlist(userId: string): Promise<{ symbol: string; name: string }[]>;
  /** Newest first. */
  operations(userId: string, limit: number): Promise<Operation[]>;
  /** Cash, position and the operation row change in one transaction, or not at all. */
  placeOrder(order: OrderInput): Promise<Operation>;
}
