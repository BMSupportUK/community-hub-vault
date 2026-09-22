CREATE TABLE public.automated_messages (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  body text NOT NULL,
  placeholders text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.automated_messages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.automated_messages TO authenticated;
GRANT SELECT ON public.automated_messages TO anon;
GRANT ALL ON public.automated_messages TO service_role;

ALTER TABLE public.automated_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read automated messages"
ON public.automated_messages FOR SELECT
USING (true);

CREATE POLICY "Admins manage automated messages"
ON public.automated_messages FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.automated_messages (key, label, description, body, placeholders, sort_order) VALUES
('ticket_out_of_hours', 'Ticket opened out of hours', 'Posted automatically when a ticket or order is opened outside business hours.', '⏰ Thanks for getting in touch! You''ve reached us outside our business hours. A staff member will reply as soon as we''re open again.', '{}', 10),
('ticket_bank_holiday', 'Ticket opened on a public holiday', 'Posted automatically when a ticket or order is opened on an England & Wales public holiday.', '🇬🇧 Thanks for getting in touch! Our office is closed today for {holiday} (UK public holiday), so no staff are available right now.

Your ticket is safe in the queue and a member of our team will reply when the office reopens on {reopen}.', '{holiday,reopen}', 20),
('ticket_owner_management', 'Private Owner & Management ticket notice', 'Posted automatically when a ticket is opened in the Owner & Management category.', '🔒 This ticket is private to the **Owner and Management team**.

No other staff or moderators can see or reply to this conversation. A member of management will respond as soon as possible.', '{}', 30);