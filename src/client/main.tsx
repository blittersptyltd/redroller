import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { navigateTo } from "@devvit/web/client";
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, Flame, Grid2X2, Image, Layers, LoaderCircle, MessageCircle, RefreshCw, Search, Shield, Sparkles, Star, X, TrendingUp, EyeOff, Keyboard, Shuffle, Globe } from "lucide-react";
import { feedQuerySchema, feedSchema, favouritesSchema, mixFeedSchema, type FeedQuery, type Post, type PageCursor, type Resume } from "../../lib/reddit";
import { ImageViewer, readJson, useReaderMemory, useDiscovery, DiscoveryPanel } from "./reader-features";
import { PrivacyGate } from "./privacy";
import "./styles.css";

const NUMBER = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function PostCard({ post, onImage }: { post: Post; onImage: (post: Post, index: number) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const hidden = (post.nsfw || post.spoiler) && !revealed;
  function openPost() { navigateTo(post.permalink); }
  const hours = Math.max(1, Math.floor((Date.now() - post.created) / 3600000));
  return <article className="post-card" data-post-id={post.id} tabIndex={-1} aria-label={hidden ? "Hidden post" : post.title}>
    {hidden ? <button className="reveal" onClick={() => setRevealed(true)}><Shield size={25}/><strong>{post.nsfw ? "NSFW content" : "Spoiler"}</strong><span>Click to reveal</span></button> : <>
      {post.video && !failed ? <video className="card-media" src={post.video} poster={post.images[0]} controls playsInline preload="none" onError={() => setFailed(true)}/>
        : post.images.length > 0 && !failed ? <div className="image-wrap">
          <button className="image-button" onClick={() => onImage(post, imageIndex)} aria-label={`View image: ${post.title}`}><img src={post.images[imageIndex]} alt={post.title} loading="lazy" decoding="async" onError={() => setFailed(true)}/></button>
          {post.images.length > 1 && <div className="gallery-controls"><button aria-label="Previous image" disabled={imageIndex === 0} onClick={() => setImageIndex((index) => index - 1)}><ChevronLeft size={16}/></button><span>{imageIndex + 1} / {post.images.length}</span><button aria-label="Next image" disabled={imageIndex === post.images.length - 1} onClick={() => setImageIndex((index) => index + 1)}><ChevronRight size={16}/></button></div>}
        </div> : null}
      {failed && <button className="media-failed" onClick={openPost}>View media on Reddit <ArrowUpRight size={15}/></button>}
    </>}
    <div className="card-body"><div className="post-meta"><span>r/{post.subreddit}</span><span>{hours >= 24 ? `${Math.floor(hours / 24)}d` : `${hours}h`} ago</span></div>
      <button className="post-title" onClick={openPost}>{hidden ? "Hidden post" : post.title}</button>
      {!hidden && post.text && <p className="post-text">{post.text}</p>}
      <div className="card-bottom"><span className="score"><TrendingUp size={14}/>{NUMBER.format(post.score)}</span><button onClick={openPost} aria-label={`${post.comments} comments`}><MessageCircle size={14}/>{NUMBER.format(post.comments)}</button><span className="author">u/{post.author}</span><button onClick={openPost} aria-label="Open on Reddit"><ArrowUpRight size={16}/></button></div>
    </div>
  </article>;
}

function Feed({ query, compact, mediaOnly, source, hideSeen, seen, resume, onSeen, onResume }: {
  query: FeedQuery; compact: boolean; mediaOnly: boolean; source: "community" | "favourites";
  hideSeen: boolean; seen: string[]; resume: Resume | null;
  onSeen: (ids: string[]) => void; onResume: (resume: Resume | null) => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);
  const [columns, setColumns] = useState(3);
  const [viewer, setViewer] = useState<{ post: Post; index: number } | null>(null);
  const [restoreNote, setRestoreNote] = useState("");
  const [restoreReady, setRestoreReady] = useState(false);
  const [autoPages, setAutoPages] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const initialResume = useRef(resume);
  const cursor = useRef<PageCursor>(resume?.after ?? null);
  const pageCursors = useRef(new Map<string, PageCursor>());
  const excluded = useRef(new Set(hideSeen ? seen : []));
  const recorded = useRef(new Set(seen));
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const restoring = useRef(!!resume);
  const restored = useRef(false);
  const activeId = useRef<string | null>(null);

  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const resize = () => setColumns(Number(getComputedStyle(element).getPropertyValue("--column-count")) || 1);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact]);

  const loadMore = useCallback(async () => {
    if (inFlight.current || ended) return;
    inFlight.current = true;
    setLoading(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    const pageCursor = cursor.current;
    try {
      const params = new URLSearchParams({ subreddit: query.subreddit, sort: query.sort, time: query.time, ...(typeof pageCursor === "string" ? { after: pageCursor } : {}) });
      const response = source === "favourites"
        ? await fetch("/api/mix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort: query.sort, time: query.time, ...(pageCursor && typeof pageCursor !== "string" ? { after: pageCursor } : {}) }), signal: abort.signal })
        : await fetch(`/api/feed?${params}`, { signal: abort.signal });
      const data = await readJson(response);
      const feed = source === "favourites" ? mixFeedSchema.parse(data) : feedSchema.parse(data);
      if (!alive.current || abort.signal.aborted) return;
      for (const post of feed.posts) if (!pageCursors.current.has(post.id)) pageCursors.current.set(post.id, pageCursor);
      setPosts((existing) => {
        const ids = new Set(existing.map((post) => post.id));
        return [...existing, ...feed.posts.filter((post) => !ids.has(post.id) && !!ids.add(post.id))];
      });
      setWarnings("warnings" in feed ? feed.warnings : []);
      setEnded(!feed.after || JSON.stringify(feed.after) === JSON.stringify(pageCursor));
      cursor.current = feed.after;
      setAutoPages((value) => value + 1);
      setRestoreReady(true);
    } catch (cause) {
      if (!abort.signal.aborted && alive.current) setError(cause instanceof Error ? cause.message : "Couldn’t load posts. Please retry.");
    } finally {
      if (alive.current && !abort.signal.aborted) { inFlight.current = false; setLoading(false); }
    }
  }, [query, source, ended]);

  useEffect(() => {
    alive.current = true;
    void loadMore();
    return () => { alive.current = false; controller.current?.abort(); };
    // Feed is keyed by source, sort, filters and refresh.
  }, []);
  useEffect(() => {
    if (!sentinel.current || loading || error || ended || autoPages >= 3) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "600px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loadMore, loading, error, ended, autoPages]);
  useEffect(() => {
    const moved = () => { if (!restoring.current) setAutoPages(0); };
    window.addEventListener("scroll", moved, { passive: true });
    window.addEventListener("wheel", moved, { passive: true });
    window.addEventListener("touchmove", moved, { passive: true });
    window.addEventListener("keydown", moved);
    return () => { window.removeEventListener("scroll", moved); window.removeEventListener("wheel", moved); window.removeEventListener("touchmove", moved); window.removeEventListener("keydown", moved); };
  }, []);

  const visiblePosts = posts.filter((post) => (!mediaOnly || post.images.length || post.video) && (!excluded.current.has(post.id) || post.id === initialResume.current?.anchor));
  useEffect(() => {
    if (!restoreReady || restored.current || !grid.current) return;
    restored.current = true;
    const saved = initialResume.current;
    if (!saved) { restoring.current = false; return; }
    const element = grid.current.querySelector<HTMLElement>(`[data-post-id="${saved.anchor}"]`);
    if (!element) {
      restoring.current = false; onResume(null);
      setRestoreNote("Your previous post is no longer in this listing. Continuing with the available posts.");
      return;
    }
    const align = () => {
      if (!restoring.current) return;
      const header = document.querySelector(".topbar")?.getBoundingClientRect().height ?? 64;
      window.scrollBy({ top: element.getBoundingClientRect().top - header - saved.offset, behavior: "instant" });
    };
    const stop = () => { restoring.current = false; };
    align();
    const resize = new ResizeObserver(align); resize.observe(grid.current);
    grid.current.addEventListener("load", align, true);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    const timer = window.setTimeout(stop, 3000);
    const currentGrid = grid.current;
    return () => {
      window.clearTimeout(timer); resize.disconnect(); currentGrid.removeEventListener("load", align, true);
      window.removeEventListener("wheel", stop); window.removeEventListener("touchstart", stop); window.removeEventListener("keydown", stop);
    };
  }, [restoreReady, onResume]);

  useEffect(() => {
    let timer = 0;
    const capture = () => {
      if (restoring.current || !grid.current || document.querySelector("dialog[open]")) return;
      if (window.scrollY < 40) { onResume(null); return; }
      const header = document.querySelector(".topbar")?.getBoundingClientRect().height ?? 64;
      const cards = [...grid.current.querySelectorAll<HTMLElement>("[data-post-id]")]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > header + 30 && rect.top < window.innerHeight)
        .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
      const card = cards[0]; const anchor = card?.element.dataset.postId;
      if (card && anchor) onResume({ anchor, after: pageCursors.current.get(anchor) ?? null, offset: Math.max(-10000, Math.min(10000, card.rect.top - header)) });
    };
    const scroll = () => { window.clearTimeout(timer); timer = window.setTimeout(capture, 300); };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("scroll", scroll); };
  }, [onResume]);

  useEffect(() => {
    const timers = new Map<Element, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.postId!;
        const visible = entry.intersectionRect.height >= Math.min(200, entry.boundingClientRect.height * .6);
        if (visible && !recorded.current.has(id) && !timers.has(entry.target)) {
          timers.set(entry.target, window.setTimeout(() => {
            timers.delete(entry.target);
            if (document.visibilityState !== "visible" || restoring.current || document.querySelector("dialog[open]")) return;
            recorded.current.add(id); onSeen([id]);
          }, 1200));
        } else if (!visible) { window.clearTimeout(timers.get(entry.target)); timers.delete(entry.target); }
      }
    }, { threshold: [0, .1, .25, .5, .75, 1], rootMargin: "-70px 0px 0px" });
    grid.current?.querySelectorAll("[data-post-id]").forEach((element) => observer.observe(element));
    return () => { observer.disconnect(); timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [posts, columns, onSeen]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.ctrlKey || event.metaKey || event.altKey || target.closest("input, textarea, select, [contenteditable=true], dialog") || viewer) return;
      if (event.key === "j" || event.key === "k") {
        event.preventDefault(); setAutoPages(0);
        const index = visiblePosts.findIndex((post) => post.id === activeId.current);
        const next = index < 0 ? 0 : Math.max(0, Math.min(visiblePosts.length - 1, index + (event.key === "j" ? 1 : -1)));
        const post = visiblePosts[next];
        if (!post) return;
        activeId.current = post.id;
        const element = grid.current?.querySelector<HTMLElement>(`[data-post-id="${post.id}"]`);
        element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: "center", behavior: "instant" });
      } else if (event.key === "Enter" && target.matches(".post-card")) {
        event.preventDefault(); target.querySelector<HTMLButtonElement>(".image-button, .reveal, .post-title")?.click();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [visiblePosts, viewer]);

  return <>
    {restoreNote && <p className="reader-notice" role="status">{restoreNote}</p>}
    {!!warnings.length && <p className="reader-notice" role="status">{warnings.join(" ")}</p>}
    <div ref={grid} className={`card-grid ${compact ? "compact" : ""}`} aria-busy={loading} onFocusCapture={(event) => { const card = (event.target as HTMLElement).closest<HTMLElement>("[data-post-id]"); if (card) activeId.current = card.dataset.postId!; }}>
      {Array.from({ length: columns }, (_, column) => <div className="card-column" key={column}>
        {visiblePosts.filter((_, index) => index % columns === column).map((post) => <PostCard key={post.id} post={post} onImage={(post, index) => { onSeen([post.id]); setViewer({ post, index }); }}/>) }
        {loading && posts.length === 0 && [0, 1].map((index) => <div key={index} className="skeleton" aria-hidden="true"><div/><span/><span/></div>)}
      </div>)}
    </div>
    <div className="feed-end" ref={sentinel}>
      {error ? <div className="error-state" role="alert"><Layers size={28}/><h2>That rabbit hole didn’t open.</h2><p>{error}</p><button className="primary" onClick={() => void loadMore()}><RefreshCw size={16}/>Try again</button></div>
        : loading ? <p role="status"><LoaderCircle className="spin" size={18}/> Finding the next good thing…</p>
        : ended ? <p>{visiblePosts.length ? "You’ve reached the end of this feed. Try another sort or community." : source === "favourites" && !posts.length ? "Star some communities to build your favourites mix." : "No posts to show. Try another community or turn off the filters."}</p>
        : <button className="load-more" onClick={() => { setAutoPages(0); void loadMore(); }}>Keep rolling <ArrowDown size={16}/></button>}
    </div>
    {viewer && <ImageViewer post={viewer.post} initialIndex={viewer.index} onClose={() => setViewer(null)}/>}
  </>;
}

function Reader({ token, openHelp }: { token: string | null; openHelp: () => void }) {
  const memory = useReaderMemory(token);
  const { state: preferences, setState: setPreferences } = memory;
  const { query, compact, mediaOnly, source, hideSeen } = preferences;
  const onSeen = useCallback((ids: string[]) => {
    setPreferences((current) => {
      const fresh = ids.filter((id) => !current.seen.includes(id));
      return fresh.length ? { ...current, seen: [...current.seen, ...fresh].slice(-2000) } : current;
    });
  }, [setPreferences]);
  const onResume = useCallback((resume: Resume | null) => {
    setPreferences((current) => JSON.stringify(current.resume) === JSON.stringify(resume) ? current : { ...current, resume });
  }, [setPreferences]);
  function setQuery(update: (current: FeedQuery) => FeedQuery) {
    setPreferences((current) => ({ ...current, query: update(current.query), resume: null }));
    window.scrollTo({ top: 0 });
  }
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [favouritesReady, setFavouritesReady] = useState(false);
  const [favouritesBusy, setFavouritesBusy] = useState(false);
  const [favouritesError, setFavouritesError] = useState("");
  const [favouritesRetry, setFavouritesRetry] = useState(0);
  const favouriteLock = useRef(false);
  const discovery = useDiscovery(favourites, memory.ready && favouritesReady, source === "community" ? query.subreddit : "");
  const isAll = source === "community" && query.subreddit.toLowerCase() === "all";
  const isFavourite = source === "community" && favourites.some((name) => name.toLowerCase() === query.subreddit.toLowerCase());

  async function readFavouritesResponse(response: Response) {
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Couldn’t load favourites. Please retry.");
    const text = await response.text();
    if (!text.trim()) throw new Error("Favourites returned an empty response. Please retry.");
    const data: unknown = JSON.parse(text);
    if (!response.ok) throw new Error(typeof data === "object" && data && "error" in data && typeof data.error === "string" ? data.error : "Couldn’t update favourites. Please retry.");
    return favouritesSchema.parse(data).favourites;
  }
  useEffect(() => {
    if (!token) { setFavourites([]); setFavouritesReady(true); return; }
    const abort = new AbortController();
    async function loadFavourites() {
      setFavouritesError("");
      try {
        const response = await fetch("/api/favourites", { signal: abort.signal });
        const saved = await readFavouritesResponse(response);
        if (!abort.signal.aborted) { setFavourites(saved); setFavouritesReady(true); }
      } catch (error) {
        if (!abort.signal.aborted) setFavouritesError(error instanceof Error ? error.message : "Couldn’t load favourites.");
      }
    }
    void loadFavourites();
    return () => abort.abort();
  }, [favouritesRetry, token]);

  async function updateFavourite(subreddit: string, saved: boolean) {
    if (!token) { openHelp(); return; }
    if (!favouritesReady || favouriteLock.current) return;
    favouriteLock.current = true; setFavouritesBusy(true); setFavouritesError("");
    try {
      const response = await fetch("/api/favourites", { method: "PUT", headers: { "Content-Type": "application/json", "X-Reader-Consent": token }, body: JSON.stringify({ subreddit, saved }) });
      setFavourites(await readFavouritesResponse(response));
      if (source === "favourites") onResume(null);
    } catch (error) {
      setFavouritesError(error instanceof Error ? error.message : "Couldn’t update favourites.");
    } finally { favouriteLock.current = false; setFavouritesBusy(false); }
  }

  const favouritesList = <>
    <div className="sidebar-label favourites-label"><Star size={12}/> FAVOURITES <span>{favourites.length || ""}</span></div>
    {!favouritesReady && !favouritesError && <p className="favourites-hint" role="status">Loading favourites…</p>}
    {favouritesReady && !favourites.length && <p className="favourites-hint">Star a community to keep it here.</p>}
    <button className={`mix-button ${source === "favourites" ? "selected" : ""}`} onClick={() => { setPreferences((current) => ({ ...current, source: "favourites", resume: null })); window.scrollTo({ top: 0 }); }}><Shuffle size={15}/> Favourites mix</button>
    <nav className="favourites-list" aria-label="Favourite subreddits">{favourites.map((name) => <div className={`favourite-row ${source === "community" && query.subreddit.toLowerCase() === name.toLowerCase() ? "selected" : ""}`} key={name.toLowerCase()}>
      <button className="favourite-open" onClick={() => chooseSubreddit(name)} aria-label={`Open favourite r/${name}`}><Star size={13} fill="currentColor"/><span>r/{name}</span></button>
      <button className="favourite-remove" disabled={favouritesBusy} onClick={() => void updateFavourite(name, false)} aria-label={`Remove r/${name} from favourites`}><X size={13}/></button>
    </div>)}</nav>
  </>;
  function chooseSubreddit(subreddit: string) {
    setPreferences((current) => ({ ...current, query: { ...current.query, subreddit }, source: "community", resume: null })); setInput(""); setInputError(""); window.scrollTo({ top: 0 });
  }
  function search(event: FormEvent) {
    event.preventDefault();
    const name = input.trim().replace(/^\/?r\//i, "").replace(/\/$/, "");
    const parsed = feedQuerySchema.safeParse({ ...query, subreddit: name });
    if (!parsed.success) { setInputError("Enter a subreddit name, like pics or EarthPorn."); return; }
    chooseSubreddit(parsed.data.subreddit);
  }
  if (!memory.ready) return <main className="reader-loading"><Layers size={30}/><h1>redroller.</h1>{memory.error ? <><p role="alert">{memory.error}</p><button className="primary" onClick={memory.reload}>Retry loading preferences</button><button onClick={memory.continueWithoutSaving}>Continue without saving this session</button></> : <p role="status">Picking up where you left off…</p>}</main>;
  return <main className="reader">
    <header className="topbar">
      <button className="brand" onClick={() => chooseSubreddit("all")} aria-label="Redroller home"><span className="brand-symbol"><Layers size={22}/></span><span className="brand-word">redroller<span className="brand-dot">.</span></span></button>
      <div className="header-search"><form className="search" onSubmit={search}><Search size={19}/><span className="search-prefix">r/</span><input aria-label="Subreddit name" placeholder="Where do you want to go?" value={input} onChange={(event) => setInput(event.target.value)} maxLength={25} aria-invalid={!!inputError} aria-describedby={inputError ? "search-error" : undefined}/><button type="submit">Let’s roll <ArrowUpRight size={16}/></button></form>
        {inputError && <p id="search-error" className="input-error" role="alert">{inputError}</p>}
      </div>
      <button className="privacy-help-button" onClick={openHelp}>Privacy &amp; help</button>
    </header>
    <div className="workspace">
      <aside className="sidebar"><div className="intro"><div className="eyebrow"><span className="status-dot"/> FIND YOUR NEXT</div><h1>Rabbit hole<span>.</span></h1><p>Your favourite communities,<br/>one card at a time.</p></div>{favouritesList}<DiscoveryPanel discovery={discovery} current={source === "community" ? query.subreddit : ""} onChoose={chooseSubreddit}/><div className="sidebar-note"><Layers size={22}/><p>A little less noise.<br/>A lot more discovery.</p><span>Start with All, or pick a community.</span></div></aside>
      <section className="feed-panel" aria-label="Subreddit reader">
        <details className="mobile-navigation"><summary><Layers size={14}/> Communities &amp; favourites <ChevronRight size={14}/></summary><div className="mobile-favourites">{favouritesList}</div><DiscoveryPanel discovery={discovery} current={source === "community" ? query.subreddit : ""} onChoose={chooseSubreddit}/></details>
        {favouritesError && <div className="favourites-error" role="alert"><span>{favouritesError}</span><button disabled={favouritesBusy} onClick={() => setFavouritesRetry((value) => value + 1)}>Reload favourites</button></div>}
        <div className="feed-toolbar"><div className="feed-name"><span className="feed-avatar">{isAll ? <Globe size={19}/> : "r/"}</span><div><h2>{source === "favourites" ? "Favourites mix" : isAll ? "All" : query.subreddit}</h2></div></div><div className="feed-actions"><div className="sort-tabs" aria-label="Sort posts">{([{ key: "hot", label: "Hot", icon: Flame }, { key: "new", label: "New", icon: Sparkles }, { key: "top", label: "Top", icon: TrendingUp }] as const).map(({ key, label, icon: Icon }) => <button key={key} aria-pressed={query.sort === key} className={query.sort === key ? "selected" : ""} onClick={() => setQuery((current) => ({ ...current, sort: key }))}><Icon size={15}/>{label}</button>)}</div><button className="icon-button" aria-label="Refresh feed" onClick={() => { onResume(null); setRefresh((value) => value + 1); window.scrollTo({ top: 0 }); }}><RefreshCw size={17}/></button></div></div>
        <div className="view-toolbar">{source === "community" && !isAll && <button className={`favourite-toggle ${isFavourite ? "saved" : ""}`} disabled={!favouritesReady || favouritesBusy} aria-pressed={isFavourite} aria-label={`${isFavourite ? "Remove" : "Add"} r/${query.subreddit} ${isFavourite ? "from" : "to"} favourites`} onClick={() => void updateFavourite(query.subreddit, !isFavourite)}>{favouritesBusy ? <LoaderCircle className="spin" size={15}/> : <Star size={15} fill={isFavourite ? "currentColor" : "none"}/>}<span>{isFavourite ? "Favourited" : "Favourite"}</span></button>}<label className="media-toggle"><input type="checkbox" checked={mediaOnly} onChange={(event) => setPreferences((current) => ({ ...current, mediaOnly: event.target.checked, resume: null }))}/><Image size={14}/>Media only</label><label className="media-toggle" title="Hide posts viewed before this feed opened. Cards stay in place while you read."><input type="checkbox" checked={hideSeen} onChange={(event) => setPreferences((current) => ({ ...current, hideSeen: event.target.checked, resume: null }))}/><EyeOff size={14}/>Hide seen</label>{hideSeen && <button className="reset-seen" onClick={() => { setPreferences((current) => ({ ...current, seen: [], resume: null })); setRefresh((value) => value + 1); }}>Reset seen ({preferences.seen.length})</button>}{query.sort === "top" && <select aria-label="Top posts time period" value={query.time} onChange={(event) => setQuery((current) => ({ ...current, time: event.target.value as FeedQuery["time"] }))}>{(["hour", "day", "week", "month", "year", "all"] as const).map((time) => <option key={time} value={time}>{time === "all" ? "All time" : `Past ${time}`}</option>)}</select>}<button className="density" aria-pressed={compact} onClick={() => setPreferences((current) => ({ ...current, compact: !current.compact }))}><Grid2X2 size={15}/>{compact ? "Compact" : "Comfortable"}</button><details className="shortcut-help"><summary aria-label="Keyboard shortcuts"><Keyboard size={17}/></summary><div><strong>Keyboard shortcuts</strong><p><kbd>J</kbd> / <kbd>K</kbd> Next / previous card</p><p><kbd>Enter</kbd> Open selected card</p><p><kbd>←</kbd> / <kbd>→</kbd> Gallery images</p><p><kbd>Esc</kbd> Close image viewer</p><span>Click inside the reader to use shortcuts.</span></div></details></div>
        {memory.saveError && <p className="reader-notice" role="alert">Your latest preferences haven’t saved. {memory.saveError} <button onClick={() => void memory.flush()}>Retry saving</button></p>}
        {(source === "community" || favouritesReady) && <Feed key={`${source}:${query.subreddit}:${query.sort}:${query.time}:${refresh}:${mediaOnly}:${hideSeen}:${source === "favourites" ? favourites.join(",") : ""}`} query={query} compact={compact} mediaOnly={mediaOnly} source={source} hideSeen={hideSeen} seen={preferences.seen} resume={preferences.resume} onSeen={onSeen} onResume={onResume}/>}
      </section>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<PrivacyGate>{(token, openHelp) => <Reader key={token ?? "temporary"} token={token} openHelp={openHelp}/>}</PrivacyGate>);
