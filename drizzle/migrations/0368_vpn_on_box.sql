CREATE TABLE public.vpn_providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  picker text NOT NULL DEFAULT 'closest' CHECK (picker IN ('nordvpn','surfshark','protonvpn','closest')),
  host_template text,
  credentials_help text,
  sort int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vpn_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpn_providers TO authenticated;
GRANT ALL ON public.vpn_providers TO service_role;
ALTER TABLE public.vpn_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read VPN providers" ON public.vpn_providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage VPN providers" ON public.vpn_providers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.vpn_providers (id, name, picker, host_template, credentials_help, sort) VALUES
 ('nordvpn','NordVPN','nordvpn',NULL,'Nord Account › NordVPN › Set up NordVPN manually › Service credentials',1),
 ('surfshark','Surfshark','surfshark',NULL,'Surfshark › VPN › Manual setup › Router › OpenVPN › Credentials',2),
 ('protonvpn','ProtonVPN','protonvpn',NULL,'Proton account › VPN › OpenVPN / IKEv2 username',3),
 ('expressvpn','ExpressVPN','closest','{cc}-{city}-ca-version-2.expressnetw.com','ExpressVPN account › Set up other devices › Manual config › OpenVPN',4),
 ('cyberghost','CyberGhost','closest','{cc}-s01-i01.cg-dialup.net','CyberGhost account › My Devices › Configure device › OpenVPN',5),
 ('pia','Private Internet Access','closest','{cc}.privacy.network','Your normal PIA username (p1234567) and password',6),
 ('ipvanish','IPVanish','closest','{city}-a01.ipvanish.com','Your IPVanish email and password',7),
 ('purevpn','PureVPN','closest','{cc}2-ovpn-udp.pointtoserver.com','PureVPN member area › Subscriptions › VPN credentials',8),
 ('windscribe','Windscribe','closest','{cc}.windscribe.com','Windscribe › Config generators › OpenVPN › Get credentials',9);

CREATE TABLE public.player_vpn_configs (
  device_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  provider_id text NOT NULL REFERENCES public.vpn_providers(id),
  cred_cipher text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  server text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','connecting','on','off','failed')),
  status_detail text,
  reselect_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_vpn_configs TO service_role;
ALTER TABLE public.player_vpn_configs ENABLE ROW LEVEL SECURITY;