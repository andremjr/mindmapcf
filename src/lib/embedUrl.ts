// Converts a public URL into a platform-optimized embed URL when possible.
// Goal: reduce ads/UI chrome without requiring the user to log in.
// Returns null when no known embed exists (caller should try the raw URL).

export type EmbedInfo = {
  embedUrl: string;
  platform: "youtube" | "instagram" | "twitter" | "tiktok" | "vimeo";
  // True when we're confident the embed will render (skip the "blocked" fallback timer).
  trusted: boolean;
};

function parseUrl(raw: string): URL | null {
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto);
  } catch {
    return null;
  }
}

export function resolveEmbed(raw: string): EmbedInfo | null {
  const u = parseUrl(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  // ---------- YouTube ----------
  // youtube-nocookie removes personalized ads and doesn't set cookies for the user.
  // rel=0 = no other-channel related videos; modestbranding=1 = minimal chrome.
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return ytEmbed(v, u);
    // /shorts/{id} or /live/{id}
    const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/);
    if (m) return ytEmbed(m[2], u);
    // /playlist?list=...
    const list = u.searchParams.get("list");
    if (list) {
      return {
        embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&rel=0&modestbranding=1`,
        platform: "youtube",
        trusted: true,
      };
    }
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    if (id) return ytEmbed(id, u);
  }

  // ---------- Vimeo ----------
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) {
      return {
        embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
        platform: "vimeo",
        trusted: true,
      };
    }
  }

  // ---------- Instagram ----------
  // /p/{code}, /reel/{code}, /tv/{code}
  if (host === "instagram.com") {
    const m = u.pathname.match(/^\/(p|reel|tv)\/([\w-]+)/);
    if (m) {
      return {
        embedUrl: `https://www.instagram.com/${m[1]}/${m[2]}/embed/`,
        platform: "instagram",
        trusted: true,
      };
    }
  }

  // ---------- X / Twitter ----------
  // Uses the public embed page (no widgets.js, no login).
  if (host === "twitter.com" || host === "x.com" || host === "mobile.twitter.com") {
    const m = u.pathname.match(/^\/([^\/]+)\/status\/(\d+)/);
    if (m) {
      const id = m[2];
      return {
        embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&hideCard=false&hideThread=false`,
        platform: "twitter",
        trusted: true,
      };
    }
  }

  // ---------- TikTok ----------
  if (host === "tiktok.com") {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) {
      return {
        embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`,
        platform: "tiktok",
        trusted: true,
      };
    }
  }

  return null;
}

function ytEmbed(id: string, orig: URL): EmbedInfo {
  // Preserve start time if present (t=90 or start=90).
  const t = orig.searchParams.get("t") ?? orig.searchParams.get("start");
  let start = "";
  if (t) {
    const n = /^\d+$/.test(t) ? Number(t) : parseYtTime(t);
    if (n > 0) start = `&start=${n}`;
  }
  return {
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${start}`,
    platform: "youtube",
    trusted: true,
  };
}

function parseYtTime(s: string): number {
  // e.g. "1m30s", "2h5m10s"
  const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(s);
  if (!m) return 0;
  const [, h, mi, se] = m;
  return (Number(h ?? 0) * 3600) + (Number(mi ?? 0) * 60) + Number(se ?? 0);
}
