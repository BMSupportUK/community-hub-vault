import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "uk.bmsupport.app",
  appName: "BM Support",
  webDir: "dist",
  server: {
    url: "https://bmsupport.uk",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: [
      "bmsupport.uk",
      "*.bmsupport.uk",
      "*.lovable.app",
      "*.supabase.co",
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0F172A",
  },
};

export default config;