import {
  type ComponentType,
  type PropsWithChildren,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { getWindowModuleId } from '../runtime/module-id';
import type {
  DesktopWindow,
  HostBridge,
  TerminalStateSnapshot,
  WindowModuleProps
} from '../types';
import { ErrorBoundary } from './ErrorBoundary';

interface WindowRuntimeProps {
  windowItem: DesktopWindow;
  hostBridge: HostBridge;
  terminalState?: TerminalStateSnapshot;
}

function RuntimeFallback({ children }: PropsWithChildren): ReactNode {
  return <div className="window-runtime__status">{children}</div>;
}

export function WindowRuntime({ windowItem, hostBridge, terminalState }: WindowRuntimeProps) {
  const [moduleComponent, setModuleComponent] = useState<ComponentType<WindowModuleProps> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedRevisionRef = useRef(0);
  const moduleId = useMemo(
    () => getWindowModuleId(windowItem.sessionId, windowItem.windowId),
    [windowItem.sessionId, windowItem.windowId]
  );

  useEffect(() => {
    if (windowItem.status !== 'ready') {
      return;
    }

    const isInitialLoad = !moduleComponent || loadedRevisionRef.current === 0;
    if (windowItem.strategy === 'hmr' && !isInitialLoad) {
      loadedRevisionRef.current = windowItem.revision;
      return;
    }

    let active = true;
    const suffix =
      windowItem.strategy === 'remount'
        ? `?rev=${windowItem.revision}&nonce=${windowItem.mountNonce}`
        : '';
    void import(/* @vite-ignore */ `${moduleId}${suffix}`)
      .then((loadedModule) => {
        if (!active) {
          return;
        }
        if (typeof loadedModule.default !== 'function') {
          throw new Error('Window module does not export a default component.');
        }
        setModuleComponent(() => loadedModule.default as ComponentType<WindowModuleProps>);
        setLoadError(null);
        loadedRevisionRef.current = windowItem.revision;
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setLoadError((error as Error).message);
      });

    return () => {
      active = false;
    };
  }, [
    moduleComponent,
    moduleId,
    windowItem.mountNonce,
    windowItem.revision,
    windowItem.status,
    windowItem.strategy
  ]);

  if (windowItem.status === 'loading') {
    return <RuntimeFallback>Generating {windowItem.title}...</RuntimeFallback>;
  }

  if (windowItem.status === 'error') {
    return <RuntimeFallback>{windowItem.error ?? 'Window generation failed.'}</RuntimeFallback>;
  }

  if (loadError) {
    return <RuntimeFallback>Failed to load module: {loadError}</RuntimeFallback>;
  }

  if (!moduleComponent) {
    return <RuntimeFallback>Loading module runtime...</RuntimeFallback>;
  }

  const ModuleComponent = moduleComponent;
  return (
    <ErrorBoundary
      fallback={(error) => (
        <RuntimeFallback>Window crashed: {error.message}</RuntimeFallback>
      )}
    >
      <Suspense fallback={<RuntimeFallback>Rendering module...</RuntimeFallback>}>
        <ModuleComponent
          host={hostBridge}
          windowState={{
            title: windowItem.title,
            revision: windowItem.revision,
            status: windowItem.status,
            terminal: terminalState
          }}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
