import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ca.kelseaziegler.invoicestudio',
  appName: 'Invoice Studio 2',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  }
};

export default config;
