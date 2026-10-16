import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { navigateTo } from "@devvit/web/client";
import { ArrowUpRight, ChevronLeft, ChevronRight, X, Sparkles, TrendingUp, Shuffle, RefreshCw, LoaderCircle } from "lucide-react";
import { readerStateSchema, discoverySchema, type Discovery, type Post, type ReaderState } from "../../lib/reddit";

export async function readJson(response: Response): Promise<unknown> {
  try {
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Unexpected response. Please retry.");
    const body = await response.text();
    if (!body.trim()) throw new Error("Empty response. Please retry.");
    const data: unknown = JSON.parse(body);
    if (!response.ok) throw new Error(typeof data === "object" && data && "error" in data && typeof data.error === "string" ? data.error : "Couldn’t complete the request. Please retry.");
    return data;
  } catch (error) { throw error; }
}

export function useReaderMemory(token: string | null) {
  const [state, setState] = useState<ReaderState>(() => readerStateSchema.parse({}));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [retry, setRetry] = useState(0);
  const latest = useRef("");
  const saved = useRef("");
  const saving = useRef(false);
  const temporary = useRef(!token);
  const mounted = useRef(true);

  const flush = useCallback(async () => {
    if (temporary.current || saving.current || !latest.current || latest.current === saved.current) return;
    saving.current = true;
    try {
      // Serialize writes so a slow previous scroll save cannot overwrite newer settings.
      while (latest.current !== saved.current) {
        const body = latest.current;
        await readJson(await fetch("/api/reader-state", { method: "PUT", headers: { "Content-Type": "application/json", "X-Reader-Consent": token ?? "" }, body, keepalive: true }));
        saved.current = body;
      }
      if (mounted.current) setSaveError("");
    } catch (cause) {
      if (mounted.current) setSaveError(cause instanceof Error ? cause.message : "Couldn’t remember your place.");
    } finally { saving.current = false; }
  }, [token]);

  useEffect(() => {
    if (!token) { setReady(true); return; }
    mounted.current = true;
    const abort = new AbortController();
    async function load() {
      setError("");
      try {
        const loaded = readerStateSchema.parse(await readJson(await fetch("/api/reader-state", { signal: abort.signal })));
        if (!abort.signal.aborted) {
          saved.current = JSON.stringify(loaded); latest.current = saved.current;
          setState(loaded); setReady(true);
        }
      } catch (cause) {
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn’t load your preferences.");
      }
    }
    void load();
    return () => { mounted.current = false; abort.abort(); };
  }, [retry, token]);
  useEffect(() => {
    if (!ready) return;
    latest.current = JSON.stringify(state);
    const timeout = window.setTimeout(() => void flush(), 700);
    return () => window.clearTimeout(timeout);
  }, [state, ready, flush]);
  useEffect(() => {
    const save = () => { void flush(); };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => { window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", save); };
  }, [flush]);
  return { state, setState, ready, error, saveError, flush, continueWithoutSaving: () => { temporary.current = true; setReady(true); }, reload: () => setRetry((value) => value + 1) };
}

export function ImageViewer({ post, initialIndex, onClose }: { post: Post; initialIndex: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const zoomPoint = useRef({ x: 0.5, y: 0.5 });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const didDrag = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    element.scrollLeft = zoomed ? zoomPoint.current.x * size.width - element.clientWidth / 2 : 0;
    element.scrollTop = zoomed ? zoomPoint.current.y * size.height - element.clientHeight / 2 : 0;
  }, [zoomed, size]);
  function change(next: number) {
    setFailed(false); setZoomed(false); setSize({ width: 0, height: 0 });
    drag.current = null; didDrag.current = false; setDragging(false); setIndex(next);
  }
  return <dialog ref={dialog} className="image-viewer" aria-labelledby="viewer-title" onCancel={(event) => {
    if (zoomed) { event.preventDefault(); setZoomed(false); } else onClose();
  }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => {
    if (zoomed && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      viewport.current?.scrollBy({ left: event.key === "ArrowLeft" ? -100 : event.key === "ArrowRight" ? 100 : 0, top: event.key === "ArrowUp" ? -100 : event.key === "ArrowDown" ? 100 : 0 });
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); change(index - 1); }
    if (event.key === "ArrowRight" && index < post.images.length - 1) { event.preventDefault(); change(index + 1); }
  }}>
    <div className="viewer-top"><div><span>r/{post.subreddit}</span><h2 id="viewer-title">{post.title}</h2></div><button aria-label="Close image viewer" onClick={onClose} autoFocus><X size={24}/></button></div>
    <div ref={viewport} className={`viewer-image${zoomed ? " zoomed" : ""}${dragging ? " dragging" : ""}`}>
      {failed ? <p role="alert">This image couldn’t load. You can open the original on Reddit below.</p> : <button className="viewer-image-button" aria-label={zoomed ? "Zoom out to fit image" : "Zoom image to full resolution"} aria-pressed={zoomed} disabled={!size.width}
        style={zoomed ? { width: size.width, height: size.height } : undefined}
        onClick={(event) => {
          if (didDrag.current) { didDrag.current = false; return; }
          if (!zoomed) {
            const box = event.currentTarget.getBoundingClientRect();
            const scale = Math.min(box.width / size.width, box.height / size.height);
            const width = size.width * scale, height = size.height * scale;
            zoomPoint.current = event.detail === 0 ? { x: 0.5, y: 0.5 } : {
              x: Math.max(0, Math.min(1, (event.clientX - box.left - (box.width - width) / 2) / width)),
              y: Math.max(0, Math.min(1, (event.clientY - box.top - (box.height - height) / 2) / height)),
            };
          }
          setZoomed(!zoomed);
        }}
        onPointerDown={(event) => {
          didDrag.current = false;
          if (!zoomed || event.button !== 0 || !viewport.current) return;
          drag.current = { x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current, element = viewport.current;
          if (!start || !element) return;
          const dx = event.clientX - start.x, dy = event.clientY - start.y;
          if (Math.hypot(dx, dy) > 4) { didDrag.current = true; setDragging(true); }
          if (didDrag.current) { element.scrollLeft = start.left - dx; element.scrollTop = start.top - dy; }
        }}
        onPointerUp={() => { drag.current = null; setDragging(false); }}
        onPointerCancel={() => { drag.current = null; didDrag.current = true; setDragging(false); }}
        onLostPointerCapture={() => { drag.current = null; setDragging(false); }}>
        <img key={index} src={post.images[index]} draggable={false} alt={`${post.title}${post.images.length > 1 ? ` — image ${index + 1} of ${post.images.length}` : ""}`} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => { setFailed(true); setZoomed(false); }}/>
      </button>}
    </div>
    <div className="viewer-bottom"><div className="viewer-gallery"><button aria-label="Previous gallery image" disabled={index === 0} onClick={() => change(index - 1)}><ChevronLeft size={22}/></button><span aria-live="polite">{index + 1} / {post.images.length}</span><button aria-label="Next gallery image" disabled={index === post.images.length - 1} onClick={() => change(index + 1)}><ChevronRight size={22}/></button></div>
      {!failed && <button className="viewer-zoom-toggle" disabled={!size.width} onClick={() => { zoomPoint.current = { x: 0.5, y: 0.5 }; setZoomed(!zoomed); }}>{zoomed ? "Fit image" : "100%"}</button>}
      <button onClick={() => navigateTo(post.permalink)}>Open on Reddit <ArrowUpRight size={16}/></button></div>
  </dialog>;
}


export function useDiscovery(favourites: string[], enabled: boolean, current: string) {
  const [mode, setMode] = useState<"recommended" | "popular" | "random">("recommended");
  const [period, setPeriod] = useState<"all" | "trending">("trending");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<Discovery | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const randomHistory = useRef<string[]>([]);
  const favouritesKey = favourites.map((name) => name.toLowerCase()).sort().join(",");
  const activeRandom = mode === "random" ? current : "";
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    async function load() {
      setLoading(true); setError(""); setResult(null);
      try {
        const params = new URLSearchParams({ mode, period, rotation: String(rotation) });
        if (mode === "random") params.set("exclude", [...randomHistory.current, activeRandom].filter(Boolean).join(","));
        let data = discoverySchema.parse(await readJson(await fetch(`/api/discovery?${params}`, { signal: abort.signal })));
        if (mode === "random" && !data.items.length && randomHistory.current.length && !abort.signal.aborted) {
          // Once a small discovery pool is exhausted, allow earlier suggestions again.
          randomHistory.current = [];
          params.set("exclude", activeRandom);
          data = discoverySchema.parse(await readJson(await fetch(`/api/discovery?${params}`, { signal: abort.signal })));
        }
        if (!abort.signal.aborted) {
          setResult(data);
          if (mode === "random") randomHistory.current = [...new Set([...randomHistory.current, ...data.items.map((item) => item.name)])].slice(-40);
        }
      } catch (cause) {
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn’t load suggestions.");
      } finally { if (!abort.signal.aborted) setLoading(false); }
    }
    void load();
    return () => abort.abort();
  }, [mode, period, rotation, favouritesKey, enabled, activeRandom]);
  return { mode, period, result, loading: loading || !enabled, error, setMode: (next: typeof mode) => { setMode(next); setRotation(0); }, setPeriod, refresh: () => setRotation((value) => (value + 1) % 100000) };
}

export function DiscoveryPanel({ discovery, current, onChoose }: {
  discovery: ReturnType<typeof useDiscovery>; current: string; onChoose: (name: string) => void;
}) {
  return <section className="discovery" aria-label="Discover communities">
    <div className="sidebar-label discovery-heading">DISCOVER <button aria-label={discovery.mode === "random" ? "Shuffle communities" : "Refresh suggestions"} onClick={discovery.refresh} disabled={discovery.loading}><RefreshCw size={13}/></button></div>
    <div className="discovery-modes" aria-label="Discovery mode">{([
      { key: "recommended", label: "Recommended", icon: Sparkles },
      { key: "popular", label: "Popular", icon: TrendingUp },
      { key: "random", label: "Random", icon: Shuffle },
    ] as const).map(({ key, label, icon: Icon }) => <button key={key} className={discovery.mode === key ? "selected" : ""} aria-pressed={discovery.mode === key} onClick={() => discovery.setMode(key)}><Icon size={14}/>{label}</button>)}</div>
    {discovery.mode === "popular" && <div className="discovery-period" aria-label="Popularity period"><button aria-pressed={discovery.period === "all"} onClick={() => discovery.setPeriod("all")}>All time</button><button aria-pressed={discovery.period === "trending"} onClick={() => discovery.setPeriod("trending")}>Trending</button></div>}
    {discovery.loading ? <p className="discovery-note" role="status"><LoaderCircle className="spin" size={13}/>Finding communities…</p>
      : discovery.error ? <div className="discovery-note" role="alert">{discovery.error}<button onClick={discovery.refresh}>Try again</button></div>
      : <><p className="discovery-note">{discovery.result?.note}</p><nav aria-label="Suggested communities">{discovery.result?.items.map((item, index) => <button key={item.name} className={`discovery-community ${current.toLowerCase() === item.name.toLowerCase() ? "selected" : ""}`} onClick={() => onChoose(item.name)} title={`${item.title}${item.members === null ? "" : ` · ${new Intl.NumberFormat("en", { notation: "compact" }).format(item.members)} members`}
${item.reason}`}><span className={`community-icon hue-${index % 4}`}>{item.name[0]!.toUpperCase()}</span><span><strong>r/{item.name}</strong><small>{discovery.mode === "recommended" || item.members === null ? item.reason : `${new Intl.NumberFormat("en", { notation: "compact" }).format(item.members)} members`}</small></span></button>)}</nav>{discovery.mode === "random" && <button className="discovery-shuffle" onClick={discovery.refresh}><Shuffle size={14}/>Shuffle again</button>}</>}
  </section>;
}
