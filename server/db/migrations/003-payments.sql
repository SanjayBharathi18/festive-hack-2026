-- Payments (docs/system.md, "Payments").
-- This build has one provider, mock: the /pay/:token screen with Pay and Fail.
--
-- status    'started' until the buyer pays or the payment fails, then
--           'paid' or 'failed'. A new try starts a new payment.
-- amount    money: the order total when the payment started.
-- refunded  money given back; 0 until she refunds the payment.
-- A payment goes with its order: the daily demo refresh deletes the demo
-- orders, and their payments with them.

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'razorpay')),
  status TEXT NOT NULL CHECK (status IN ('started', 'paid', 'failed')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  refunded INTEGER NOT NULL DEFAULT 0 CHECK (refunded BETWEEN 0 AND amount),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX payments_order ON payments (order_id, created_at);

-- The expiry sweep looks only at the orders that wait for their payment.
CREATE INDEX orders_awaiting_payment ON orders (created_at)
  WHERE status = 'awaiting_payment';
