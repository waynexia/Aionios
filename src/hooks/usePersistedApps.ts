import { useCallback, useEffect, useMemo, useState } from 'react';
import { listPersistedApps } from '../api/client';
import type { AppDefinition, PersistedAppDescriptor } from '../types';

export function usePersistedApps() {
  const [persistedApps, setPersistedApps] = useState<PersistedAppDescriptor[]>([]);

  const upsertPersistedApp = useCallback((descriptor: PersistedAppDescriptor) => {
    setPersistedApps((current) => {
      const index = current.findIndex((entry) => entry.appId === descriptor.appId);
      if (index === -1) {
        const next = [...current, descriptor];
        next.sort((left, right) => left.title.localeCompare(right.title, 'en-US'));
        return next;
      }
      const next = [...current];
      next[index] = descriptor;
      next.sort((left, right) => left.title.localeCompare(right.title, 'en-US'));
      return next;
    });
  }, []);

  const { persistedAppDefinitionById, persistedAppDescriptorById, desktopPersistedAppDefinitions } = useMemo(() => {
    const byId = new Map<string, AppDefinition>();
    const descriptors = new Map<string, PersistedAppDescriptor>();
    const desktop: AppDefinition[] = [];
    for (const descriptor of persistedApps) {
      const definition: AppDefinition = {
        appId: descriptor.appId,
        title: descriptor.title,
        icon: descriptor.icon,
        hint: descriptor.directory === '/' ? 'Saved app' : `Saved app in ${descriptor.directory}`,
        kind: 'llm'
      };
      byId.set(descriptor.appId, definition);
      descriptors.set(descriptor.appId, descriptor);
      desktop.push(definition);
    }
    desktop.sort((left, right) => left.title.localeCompare(right.title, 'en-US'));
    return {
      persistedAppDefinitionById: byId,
      persistedAppDescriptorById: descriptors,
      desktopPersistedAppDefinitions: desktop
    };
  }, [persistedApps]);

  const refreshPersistedApps = useCallback(async () => {
    try {
      const { apps } = await listPersistedApps();
      setPersistedApps(apps);
    } catch (error) {
      console.warn('[aionios] unable to load persisted apps', error);
    }
  }, []);

  useEffect(() => {
    void refreshPersistedApps();
  }, [refreshPersistedApps]);

  return {
    persistedApps,
    desktopPersistedAppDefinitions,
    persistedAppDefinitionById,
    persistedAppDescriptorById,
    refreshPersistedApps,
    upsertPersistedApp
  };
}

