-- Fictional instruments. base_cents is the previous close and the centre of the simulated price.
CREATE TABLE instruments (
  symbol text PRIMARY KEY,
  name text NOT NULL,
  base_cents integer NOT NULL CHECK (base_cents > 0)
);

CREATE TABLE news (
  id text PRIMARY KEY,
  title text NOT NULL,
  source text NOT NULL,
  published_at timestamptz NOT NULL,
  symbol text REFERENCES instruments (symbol)
);
