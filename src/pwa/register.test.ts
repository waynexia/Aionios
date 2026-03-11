import { describe, expect, it } from 'vitest';
import { supportsServiceWorker } from './register';

describe('supportsServiceWorker', () => {
  it('requires both service worker support and a secure context', () => {
    expect(
      supportsServiceWorker(
        {
          serviceWorker: {} as Navigator['serviceWorker']
        },
        { isSecureContext: true }
      )
    ).toBe(true);

    expect(
      supportsServiceWorker(
        {
          serviceWorker: {} as Navigator['serviceWorker']
        },
        { isSecureContext: false }
      )
    ).toBe(false);

    expect(supportsServiceWorker(undefined, { isSecureContext: true })).toBe(false);
  });
});
