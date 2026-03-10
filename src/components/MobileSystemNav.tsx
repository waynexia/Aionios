interface MobileSystemNavProps {
  surface: 'home' | 'app' | 'recents';
  canGoBack: boolean;
  hasTasks: boolean;
  onBack: () => void;
  onHome: () => void;
  onRecents: () => void;
}

export function MobileSystemNav({
  surface,
  canGoBack,
  hasTasks,
  onBack,
  onHome,
  onRecents
}: MobileSystemNavProps) {
  return (
    <nav className="mobile-system-nav" aria-label="Mobile system navigation" data-mobile-system-nav>
      <button
        type="button"
        className="mobile-system-nav__button"
        data-mobile-nav-button="back"
        aria-label="Back"
        disabled={!canGoBack}
        onClick={() => onBack()}
      >
        <span className="mobile-system-nav__icon mobile-system-nav__icon--back" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="mobile-system-nav__button"
        data-mobile-nav-button="home"
        aria-label="Home"
        data-mobile-surface={surface}
        onClick={() => onHome()}
      >
        <span className="mobile-system-nav__icon mobile-system-nav__icon--home" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="mobile-system-nav__button"
        data-mobile-nav-button="recents"
        aria-label="Recent tasks"
        disabled={!hasTasks}
        onClick={() => onRecents()}
      >
        <span className="mobile-system-nav__icon mobile-system-nav__icon--recents" aria-hidden="true" />
      </button>
    </nav>
  );
}
