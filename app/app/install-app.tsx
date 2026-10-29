"use client";

import { useEffect, useState } from "react";

type Platform = "installed" | "ios" | "android" | "desktop";

function detect(): Platform {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(agent)) return "android";
  return "desktop";
}

/** One-tap install where the browser allows it; step-by-step instructions everywhere else. */
export function InstallApp() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Reading the device type has to wait until the page is in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detect());
    setCanPrompt(Boolean(window.__journolInstallPrompt));
    const ready = () => setCanPrompt(Boolean(window.__journolInstallPrompt));
    const installed = () => setDone(true);
    window.addEventListener("journol:installable", ready);
    window.addEventListener("journol:installed", installed);
    return () => {
      window.removeEventListener("journol:installable", ready);
      window.removeEventListener("journol:installed", installed);
    };
  }, []);

  async function install() {
    const offer = window.__journolInstallPrompt;
    if (!offer) return;
    await offer.prompt();
    const choice = await offer.userChoice;
    window.__journolInstallPrompt = null;
    setCanPrompt(false);
    if (choice.outcome === "accepted") setDone(true);
  }

  if (platform === null) return <section className="ruled"><p className="muted">Checking your device…</p></section>;

  if (platform === "installed" || done) {
    return (
      <section className="ruled install-card">
        <h2>Journol is installed</h2>
        <p>Open it from your home screen or app list any time.</p>
      </section>
    );
  }

  return (
    <section className="ruled install-card">
      {canPrompt ? (
        <>
          <h2>Install in one tap</h2>
          <p>Your browser can add Journol as an app straight away.</p>
          <button type="button" className="button button-primary button-large" onClick={install}>Install Journol</button>
        </>
      ) : null}

      {platform === "ios" ? (
        <>
          <h2>On iPhone or iPad</h2>
          <ol className="install-steps">
            <li>Open <strong>journol.onrender.com</strong> in <strong>Safari</strong>.</li>
            <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up) at the bottom of the screen.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
        </>
      ) : null}

      {platform === "android" && !canPrompt ? (
        <>
          <h2>On Android</h2>
          <ol className="install-steps">
            <li>Open <strong>journol.onrender.com</strong> in <strong>Chrome</strong>.</li>
            <li>Tap the <strong>⋮</strong> menu at the top right.</li>
            <li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.</li>
          </ol>
        </>
      ) : null}

      {platform === "desktop" && !canPrompt ? (
        <>
          <h2>On a computer</h2>
          <ol className="install-steps">
            <li>Open <strong>journol.onrender.com</strong> in <strong>Chrome</strong> or <strong>Edge</strong>.</li>
            <li>Click the <strong>install icon</strong> at the right end of the address bar (a screen with a down arrow).</li>
            <li>Click <strong>Install</strong>. On a Mac with Safari, choose <strong>File → Add to Dock</strong>.</li>
          </ol>
        </>
      ) : null}

      {platform !== "ios" ? (
        <p className="small muted" style={{ marginTop: 16 }}>On an iPhone? Open this page in Safari and use Share → Add to Home Screen.</p>
      ) : (
        <p className="small muted" style={{ marginTop: 16 }}>On Android? Open this page in Chrome and tap Install.</p>
      )}
    </section>
  );
}
