import { useEffect, useRef, useState, type ReactNode } from "react";
import { navigateTo } from "@devvit/web/client";
import { Layers, X } from "lucide-react";
import { privacyStatusSchema } from "../../lib/reddit";
import { readJson } from "./reader-features";

function PrivacyDetails() {
  return <div className="privacy-details">
    <p>Redroller is an independent reader supported through r/redroller. It is not endorsed by Reddit. This release shows public, non-mature communities; use the original Reddit post to report content.</p>
    <details><summary>Privacy policy</summary>
      <p>If you choose “Remember my reading”, we store your Reddit user ID, favourites, display preferences, up to 2,000 seen-post IDs, and your place in the feed using Reddit’s app storage. Each subreddit installation keeps its own data. Your favourites are not added to your Reddit subscriptions.</p>
      <p>Saving is optional. Without it, reading preferences last only for this open reader. We do not save post bodies or media, sell your data, use it for advertising or AI training, or send your reading history to an external analytics service. Reddit and media hosts still process requests needed to display content.</p>
      <p>Saved data expires 30 days after its last save. “Delete my saved data” removes it from this installation and stops this reader saving again. Older open tabs cannot restore it without a fresh choice to remember. Earlier playtest data gets a 30-day expiry when accessed or when the installing developer upgrades.</p>
      <p>Devvit currently provides no supported account-deletion notification for this app. Data from an inactive or deleted account therefore expires within the retention period after its last save. For earlier removal or privacy questions, contact the r/redroller moderators and include the subreddit where you used Redroller. Reddit controls its own service logs and retention separately.</p>
      <p>Policy updated 16 October 2026.</p>
    </details>
    <details><summary>Terms of use</summary>
      <p>Redroller provides a free browsing interface for Reddit users. Reddit’s rules and access restrictions still apply. Do not use it to bypass content restrictions, harass others, infringe rights, or collect content for prohibited purposes.</p>
      <p>Posts and media belong to their respective owners. Availability, image quality, and reading-position recovery depend on Reddit and may change. The app is provided as available; these terms do not exclude rights that cannot legally be excluded. Support and concerns can be raised with the r/redroller moderators.</p>
    </details>
    <button className="privacy-support" onClick={() => navigateTo("https://www.reddit.com/message/compose/?to=%2Fr%2Fredroller&subject=Redroller%20support")}>Report an issue / contact support ↗</button>
    <p className="privacy-note">This opens Reddit’s message composer. You choose what to send.</p>
  </div>;
}

function PrivacyDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog className="privacy-dialog" ref={dialog} aria-labelledby="privacy-title" onCancel={onClose}>
    <div className="privacy-heading"><h2 id="privacy-title">Privacy &amp; help</h2><button aria-label="Close privacy and help" onClick={onClose}><X size={22}/></button></div>{children}
  </dialog>;
}

export function PrivacyGate({ children }: { children: (token: string | null, openHelp: () => void) => ReactNode }) {
  const [status, setStatus] = useState<{ signedIn: boolean; token: string | null } | null>(null);
  const [temporary, setTemporary] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        setError("");
        const result = privacyStatusSchema.parse(await readJson(await fetch("/api/privacy", { signal: abort.signal })));
        if (!abort.signal.aborted) setStatus(result);
      } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn’t load privacy choices."); }
    }
    void load();
    return () => abort.abort();
  }, [retry]);
  async function remember() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = privacyStatusSchema.parse(await readJson(await fetch("/api/privacy", { method: "POST", headers: { "Content-Type": "application/json", ...(status?.token ? { "X-Reader-Consent": status.token } : {}) }, body: JSON.stringify({ remember: true }) })));
      setStatus(result); setTemporary(false); setNotice("Saving is on. Your existing saved favourites, if any, are available.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t enable saving."); }
    finally { setBusy(false); }
  }
  async function removeData() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await readJson(await fetch("/api/privacy", { method: "DELETE", headers: status?.token ? { "X-Reader-Consent": status.token } : {} }));
      if (!result || typeof result !== "object" || !("deleted" in result) || result.deleted !== true) throw new Error("Couldn’t confirm deletion. Please retry.");
      setStatus((current) => current ? { ...current, token: null } : current); setTemporary(true); setConfirmDelete(false);
      setNotice("Your saved data has been deleted. Saving is now off.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t delete saved data."); }
    finally { setBusy(false); }
  }
  const choices = <>
    <p>Remember favourites, preferences, seen posts and your place across visits? Saved data is linked to your Reddit account in this subreddit’s app storage and expires 30 days after its last save.</p>
    {!status?.token && <div className="privacy-actions"><button className="primary" disabled={busy || !status?.signedIn} onClick={() => void remember()}>Remember my reading</button><button disabled={busy} onClick={() => { setTemporary(true); setShowHelp(false); }}>Continue without saving</button></div>}
    {!status?.signedIn && <p>Sign in to Reddit to use saved favourites and reading memory.</p>}
    <PrivacyDetails/>
    {status?.signedIn && <div className="privacy-delete">{confirmDelete ? <><p>This removes all favourites, preferences and seen history saved in this installation. It cannot be undone.</p><button disabled={busy} onClick={() => void removeData()}>Delete my saved data now</button><button disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></> : <button disabled={busy} onClick={() => setConfirmDelete(true)}>Delete my saved data</button>}</div>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </>;
  if (!status) return <main className="reader-loading"><Layers size={30}/><h1>redroller.</h1>{error ? <><p role="alert">{error}</p><button className="primary" onClick={() => setRetry((value) => value + 1)}>Retry</button></> : <p role="status">Loading your privacy choices…</p>}</main>;
  if (!status.token && !temporary) return <main className="privacy-welcome"><Layers size={30}/><h1>Your reading, your choice.</h1>{choices}</main>;
  return <>{children(status.token, () => { setShowHelp(true); setConfirmDelete(false); setRetry((value) => value + 1); })}{showHelp && <PrivacyDialog onClose={() => setShowHelp(false)}>{choices}</PrivacyDialog>}</>;
}
