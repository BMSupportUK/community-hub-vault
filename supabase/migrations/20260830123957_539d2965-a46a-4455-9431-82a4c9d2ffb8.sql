ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;

-- Restore / normalise the Welcome channel
UPDATE public.chat_channels
SET name = 'welcome', slug = 'welcome', group_label = 'Welcome', icon = 'Hand', is_protected = true, sort_order = 1
WHERE group_label = 'Welcome';

INSERT INTO public.chat_channels (slug, name, group_label, icon, staff_only, sort_order, is_protected)
SELECT 'welcome', 'welcome', 'Welcome', 'Hand', false, 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE slug = 'welcome');

INSERT INTO public.chat_channels (slug, name, group_label, icon, staff_only, sort_order, is_protected)
SELECT 'rules', 'rules', 'Rules', 'ScrollText', false, 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE slug = 'rules');

-- Seed pinned starter posts if the channels are empty
INSERT INTO public.chat_messages (channel_id, sender_id, content, pinned_at, pinned_by)
SELECT c.id, '73c113ce-ce1b-43f0-af24-c2a36cf0d8e7',
 'Welcome to BM Support! Say hello, grab your subscription details from the vault, and open a support ticket any time you need us.',
 now(), '73c113ce-ce1b-43f0-af24-c2a36cf0d8e7'
FROM public.chat_channels c
WHERE c.slug = 'welcome'
  AND NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.channel_id = c.id);

INSERT INTO public.chat_messages (channel_id, sender_id, content, pinned_at, pinned_by)
SELECT c.id, '73c113ce-ce1b-43f0-af24-c2a36cf0d8e7',
 'House rules: 1) Be respectful — no abuse, hate or harassment. 2) No sharing of login credentials or account details in chat. 3) Keep channels on topic. 4) No spam, self-promotion or advertising. 5) Support questions belong in a ticket so we can track them. 6) Staff decisions are final — breaches can lead to a mute or ban.',
 now(), '73c113ce-ce1b-43f0-af24-c2a36cf0d8e7'
FROM public.chat_channels c
WHERE c.slug = 'rules'
  AND NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.channel_id = c.id);

-- Guard: protected channels can never be deleted
CREATE OR REPLACE FUNCTION public.prevent_protected_channel_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_protected THEN
    RAISE EXCEPTION 'Channel "%" is protected and cannot be deleted', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_protected_channel_delete ON public.chat_channels;
CREATE TRIGGER trg_prevent_protected_channel_delete
BEFORE DELETE ON public.chat_channels
FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_channel_delete();