DROP TRIGGER IF EXISTS grant_subscriber_on_completed_order_trg ON private.orders;
CREATE TRIGGER grant_subscriber_on_completed_order_trg
AFTER UPDATE ON private.orders
FOR EACH ROW
EXECUTE FUNCTION public.grant_subscriber_on_completed_order();