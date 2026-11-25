-- Desk fixes: each refund is kept on its
-- order, for a cash payment as for an online one.
--
-- refund_amount  money that the last refund gave back; NULL until she
--                refunds the order. A cash refund gives back the total.
-- refund_online  1 when that refund gave back the simulated online payment.

ALTER TABLE orders ADD COLUMN refund_amount INTEGER CHECK (refund_amount >= 0);
ALTER TABLE orders ADD COLUMN refund_online INTEGER NOT NULL DEFAULT 0
  CHECK (refund_online IN (0, 1));

UPDATE orders
SET
  refund_amount = (
    SELECT max(payments.refunded) FROM payments
    WHERE payments.order_id = orders.id AND payments.refunded > 0
  ),
  refund_online = 1
WHERE EXISTS (
  SELECT 1 FROM payments
  WHERE payments.order_id = orders.id AND payments.refunded > 0
);
