-- Money is stored as integer cents; quantities are whole units.
CREATE TABLE balances (
  user_id text PRIMARY KEY REFERENCES users (id),
  cash_cents integer NOT NULL CHECK (cash_cents >= 0)
);

CREATE TABLE positions (
  user_id text NOT NULL REFERENCES users (id),
  symbol text NOT NULL REFERENCES instruments (symbol),
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE watchlist (
  user_id text NOT NULL REFERENCES users (id),
  symbol text NOT NULL REFERENCES instruments (symbol),
  sort_order integer NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE operations (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id),
  symbol text NOT NULL REFERENCES instruments (symbol),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity integer NOT NULL CHECK (quantity > 0),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  total_cents integer NOT NULL CHECK (total_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operations_user_recent ON operations (user_id, created_at DESC, id DESC);
