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
import { getAppDefinition } from '../app-catalog';
import { getWindowModuleId } from '../runtime/module-id';
import type {
  DesktopWindow,
  HostBridge,
  TerminalStateSnapshot,
  WindowModuleProps
} from '../types';
import { ErrorBoundary } from './ErrorBoundary';
import { LlmGenerationExperience } from './LlmGenerationExperience';

const LLM_LOADING_EXIT_MS = 680;

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
  const isSystemApp = getAppDefinition(windowItem.appId)?.kind === 'system';
  const hmrSupported = Boolean(import.meta.hot);
  const isLlmLoading = !isSystemApp && windowItem.status === 'loading';
  const [loadingPhase, setLoadingPhase] = useState<'hidden' | 'loading' | 'completing'>(
    isLlmLoading ? 'loading' : 'hidden'
  );
  const [loadingCycle, setLoadingCycle] = useState(() => (isLlmLoading ? 1 : 0));
  const loadingExitTimerRef = useRef<number | null>(null);
  const wasLlmLoadingRef = useRef(isLlmLoading);
  const moduleId = useMemo(
    () => getWindowModuleId(windowItem.sessionId, windowItem.windowId),
    [windowItem.sessionId, windowItem.windowId]
  );

  useEffect(() => {
    return () => {
      if (loadingExitTimerRef.current !== null) {
        window.clearTimeout(loadingExitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const wasLoading = wasLlmLoadingRef.current;

    if (isLlmLoading) {
      if (loadingExitTimerRef.current !== null) {
        window.clearTimeout(loadingExitTimerRef.current);
        loadingExitTimerRef.current = null;
      }
      if (!wasLoading) {
        setLoadingCycle((current) => current + 1);
      }
      setLoadingPhase('loading');
    } else if (wasLoading) {
      if (loadingExitTimerRef.current !== null) {
        window.clearTimeout(loadingExitTimerRef.current);
      }
      setLoadingPhase('completing');
      loadingExitTimerRef.current = window.setTimeout(() => {
        setLoadingPhase('hidden');
        loadingExitTimerRef.current = null;
      }, LLM_LOADING_EXIT_MS);
    }

    wasLlmLoadingRef.current = isLlmLoading;
  }, [isLlmLoading]);

  useEffect(() => {
    if (windowItem.status !== 'ready') {
      return;
    }

    const isInitialLoad = !moduleComponent || loadedRevisionRef.current === 0;
    if (hmrSupported && windowItem.strategy === 'hmr' && !isInitialLoad) {
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
    hmrSupported,
    moduleId,
    windowItem.mountNonce,
    windowItem.revision,
    windowItem.status,
    windowItem.strategy
  ]);

  if (windowItem.status === 'loading') {
    if (loadingPhase !== 'hidden') {
      return (
        <LlmGenerationExperience
          key={`${windowItem.windowId}:${loadingCycle}`}
          title={windowItem.title}
          phase={loadingPhase === 'loading' ? 'loading' : 'completing'}
        />
      );
    }
    return (
      <RuntimeFallback>
        {isSystemApp ? `Opening ${windowItem.title}...` : `Generating ${windowItem.title}...`}
      </RuntimeFallback>
    );
  }

  if (loadingPhase !== 'hidden') {
    return (
      <LlmGenerationExperience
        key={`${windowItem.windowId}:${loadingCycle}`}
        title={windowItem.title}
        phase={loadingPhase === 'loading' ? 'loading' : 'completing'}
      />
    );
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
          key={`${windowItem.windowId}:${windowItem.mountNonce}`}
          host={hostBridge}
          windowState={{
            title: windowItem.title,
            revision: windowItem.revision,
            status: windowItem.status,
            launch: windowItem.launch,
            terminal: terminalState
          }}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
