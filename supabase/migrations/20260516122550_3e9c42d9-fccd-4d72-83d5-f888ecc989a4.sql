ALTER TABLE private.app_credentials REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE private.app_credentials;