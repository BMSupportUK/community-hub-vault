insert into public.app_settings (key, value)
values ('timezone', jsonb_build_object('tz', 'Europe/London'))
on conflict (key) do nothing;