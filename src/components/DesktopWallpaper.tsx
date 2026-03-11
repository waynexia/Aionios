import { useEffect, useRef } from 'react';
import type { WallpaperState } from '../types';

interface DesktopWallpaperProps {
  wallpaper: WallpaperState | null;
}

export function DesktopWallpaper({ wallpaper }: DesktopWallpaperProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!wallpaper || wallpaper.kind !== 'video') {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => undefined);
    }
  }, [wallpaper]);

  if (!wallpaper) {
    return null;
  }

  return (
    <div className="desktop-wallpaper" data-desktop-wallpaper data-kind={wallpaper.kind}>
      <div className="desktop-wallpaper__atmosphere" aria-hidden="true" />
      {wallpaper.kind === 'image' ? (
        <img
          data-desktop-wallpaper-image
          className="desktop-wallpaper__media"
          src={wallpaper.source}
          alt=""
          draggable={false}
        />
      ) : (
        <video
          ref={videoRef}
          data-desktop-wallpaper-video
          className="desktop-wallpaper__media"
          src={wallpaper.source}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
        />
      )}
      <div className="desktop-wallpaper__grid" aria-hidden="true" />
      <div className="desktop-wallpaper__horizon" aria-hidden="true" />
      <div className="desktop-wallpaper__overlay" aria-hidden="true" />
      <div className="desktop-wallpaper__brandmark" aria-hidden="true">
        <span>Aionios</span>
        <small>Editorial Control Room</small>
      </div>
    </div>
  );
}
