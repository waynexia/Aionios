export function supportsServiceWorker(
  navigatorLike: Pick<Navigator, 'serviceWorker'> | undefined,
  windowLike: Pick<Window, 'isSecureContext'> | undefined
) {
  if (!navigatorLike || !windowLike) {
    return false;
  }
  return 'serviceWorker' in navigatorLike && Boolean(windowLike.isSecureContext);
}

export async function registerServiceWorker(scriptUrl = '/service-worker.js') {
  if (!supportsServiceWorker(globalThis.navigator, globalThis.window)) {
    return null;
  }

  const register = async () => {
    const registration = await navigator.serviceWorker.register(scriptUrl, {
      scope: '/'
    });
    return registration;
  };

  if (document.readyState === 'complete') {
    return register();
  }

  return new Promise((resolve, reject) => {
    const onLoad = () => {
      window.removeEventListener('load', onLoad);
      void register().then(resolve).catch(reject);
    };
    window.addEventListener('load', onLoad, { once: true });
  });
}
