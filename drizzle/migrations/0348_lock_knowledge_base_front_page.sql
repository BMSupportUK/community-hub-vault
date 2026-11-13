CREATE OR REPLACE FUNCTION public.protect_kb_front_page() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'kb_articles' AND OLD.id IN ('2425814c-fc19-4294-9f3b-696c66024c27'::uuid, '2cdd5514-f5d6-40d2-b53e-fbe63524599c'::uuid, '86265c25-cd0c-4c3c-bb16-279fcd9b96bc'::uuid, 'b4c52ea5-1fda-472c-b748-f62fc7b15fe3'::uuid)
     OR TG_TABLE_NAME = 'kb_categories' AND OLD.id IN ('7f3789fb-e9d8-408e-893d-0c933ed80f83'::uuid, '22b99c85-97cf-4546-96c2-a0ad944e3eff'::uuid, '0aeef402-5f79-4857-a56b-09107dad8096'::uuid, '16aa8433-2c8f-559c-bde1-974d336d2864'::uuid, '9244bba3-808f-4cd6-b651-07d959510a75'::uuid, '2088f72f-c902-4d63-b523-74698b2dddeb'::uuid, 'dc5ea405-ffdd-48aa-bd97-8587c4c97b90'::uuid, '616d69de-2510-4ad4-9da3-d784aceb4ade'::uuid) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'The approved Knowledge Base front page is locked' USING ERRCODE = '23514';
    END IF;
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'The approved Knowledge Base front page is locked' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_kb_front_articles BEFORE UPDATE OR DELETE ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.protect_kb_front_page();
CREATE TRIGGER protect_kb_front_categories BEFORE UPDATE OR DELETE ON public.kb_categories FOR EACH ROW EXECUTE FUNCTION public.protect_kb_front_page();