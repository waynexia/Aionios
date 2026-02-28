import type { HostFileEntry } from '../types';

interface FilePanelProps {
  files: HostFileEntry[];
}

export function FilePanel({ files }: FilePanelProps) {
  return (
    <aside className="file-panel">
      <h2>Host Files</h2>
      {files.length === 0 ? (
        <p className="file-panel__empty">No file yet. Generated apps can write files via Host Bridge.</p>
      ) : (
        <ul className="file-panel__list">
          {files.map((file) => (
            <li key={file.path} className="file-panel__item">
              <p className="file-panel__path">{file.path}</p>
              <p className="file-panel__content">{file.content}</p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
