import type { AppInfo } from '@shared/ipc-contract';
import { EXTERNAL_LINKS } from '@shared/ipc-contract';
import { useEffect, useState } from 'react';

import { getApi } from '../app/api';
import { useStore } from '../app/store';
import { Logo } from '../components/Logo';

/** Open a link in the OS browser (the renderer never navigates itself). */
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <a
      className="ext-link"
      href={href}
      onClick={(e) => {
        e.preventDefault();
        void getApi().openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
};

/** About box: what this is, who made it, and the versions under the hood. */
export function AboutModal(): React.JSX.Element {
  const { closeModal, openHelp, showToast } = useStore();
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void getApi()
      .getAppInfo()
      .then(setInfo)
      .catch(() => {
        setInfo(null);
      });
  }, []);

  const copyDiagnostics = (): void => {
    if (info === null) return;
    const text =
      `Ariadne ${info.version}\n` +
      `Platform: ${PLATFORM_NAMES[info.platform] ?? info.platform}\n` +
      `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}\n` +
      `Data folder: ${info.dataDir}\n`;
    navigator.clipboard.writeText(text).then(
      () => {
        showToast('Version details copied');
      },
      () => {
        showToast('Copy failed — check permissions');
      },
    );
  };

  return (
    <div className="overlay" onClick={closeModal} data-testid="about-overlay">
      <div
        className="modal-panel about-modal"
        role="dialog"
        aria-label="About Ariadne"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <button className="modal-close about-close" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="about-hero">
          <Logo size={56} />
          <div className="about-name">Ariadne</div>
          <div className="about-version" data-testid="about-version">
            {info === null ? 'Version …' : `Version ${info.version}`}
          </div>
          <p className="about-tagline">
            A single-user, local-first project &amp; task tracker. Your workspace is plain JSON and
            ordinary files on this computer — no account, no server, no telemetry.
          </p>
        </div>

        <div className="about-links">
          <ExternalLink href={EXTERNAL_LINKS.github}>Source on GitHub ↗</ExternalLink>
          <ExternalLink href={EXTERNAL_LINKS.issues}>Report an issue ↗</ExternalLink>
          <ExternalLink href={EXTERNAL_LINKS.author}>timhowland.com ↗</ExternalLink>
        </div>

        <div className="about-meta">
          <div className="about-credit">Built by Tim Howland</div>
          {info !== null && (
            <>
              <div className="about-runtime" data-testid="about-runtime">
                {PLATFORM_NAMES[info.platform] ?? info.platform} · Electron {info.electron} ·
                Chromium {info.chrome} · Node {info.node}
              </div>
              <div className="about-datadir" title={info.dataDir}>
                {info.dataDir}
              </div>
            </>
          )}
        </div>

        <div className="about-actions">
          <button
            className="btn ghost"
            onClick={() => {
              openHelp();
            }}
          >
            Open help
          </button>
          <button className="btn ghost" onClick={copyDiagnostics} disabled={info === null}>
            Copy version details
          </button>
          <div className="spacer" />
          <button className="btn primary" onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
