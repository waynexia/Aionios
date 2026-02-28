import type { AppDefinition } from '../types';

interface DesktopIconsProps {
  apps: AppDefinition[];
  onOpenApp: (appId: string) => void;
}

export function DesktopIcons({ apps, onOpenApp }: DesktopIconsProps) {
  return (
    <section className="desktop-icons" aria-label="Desktop apps">
      {apps.map((app) => (
        <button
          key={app.appId}
          className="desktop-icon"
          onDoubleClick={() => onOpenApp(app.appId)}
          onClick={() => onOpenApp(app.appId)}
          title={`${app.title} — ${app.hint}`}
        >
          <span className="desktop-icon__emoji">{app.icon}</span>
          <span className="desktop-icon__label">{app.title}</span>
        </button>
      ))}
    </section>
  );
}
