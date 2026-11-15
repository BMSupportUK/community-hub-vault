ALTER TABLE public.vpn_providers ADD COLUMN auth_kind text NOT NULL DEFAULT 'wg_config' CHECK (auth_kind IN ('nord_token','private_key','wg_config'));
UPDATE public.vpn_providers SET auth_kind = 'nord_token', credentials_help = 'Nord Account › NordVPN › Set up NordVPN manually › Generate new token' WHERE id = 'nordvpn';
UPDATE public.vpn_providers SET auth_kind = 'private_key', credentials_help = 'Surfshark › VPN › Manual setup › Router › WireGuard › I don''t have a key pair › copy the Private key' WHERE id = 'surfshark';
UPDATE public.vpn_providers SET credentials_help = CASE id
 WHEN 'protonvpn' THEN 'Proton account › VPN › Downloads › WireGuard configuration › pick the nearest server › Download, then paste the file here'
 WHEN 'expressvpn' THEN 'ExpressVPN account › Set up other devices › WireGuard › pick a nearby location › copy the configuration'
 WHEN 'cyberghost' THEN 'CyberGhost account › My Devices › Configure new device › WireGuard › download and paste the file'
 WHEN 'pia' THEN 'PIA website › Downloads › WireGuard configuration generator › nearest region › paste the file'
 WHEN 'ipvanish' THEN 'IPVanish account › Server list › WireGuard › nearest city › paste the configuration'
 WHEN 'purevpn' THEN 'PureVPN member area › Manual configuration › WireGuard › nearest server › paste the file'
 WHEN 'windscribe' THEN 'Windscribe › Config generators › WireGuard › nearest location › paste the file'
 ELSE credentials_help END WHERE auth_kind = 'wg_config';