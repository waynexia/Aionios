import { useEffect, useState } from 'react';
import { isMobileViewportWidth } from '../mobile/shell';

function readViewportWidth() {
  if (typeof window === 'undefined') {
    return 1280;
  }
  return window.innerWidth;
}

export function useCompactViewport() {
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    isMobileViewportWidth(readViewportWidth())
  );

  useEffect(() => {
    const update = () => {
      setIsCompactViewport(isMobileViewportWidth(readViewportWidth()));
    };

    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
  }, []);

  return isCompactViewport;
}
