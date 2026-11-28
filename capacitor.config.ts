import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.thikanahub.app",

  appName: "ThikanaHub",

  webDir: "out",

  server: {
    hostname: "localhost",
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;