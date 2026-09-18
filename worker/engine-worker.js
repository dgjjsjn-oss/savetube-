/* ============================================================
   SaveTube streaming engine v2 — Cloudflare Worker
   ------------------------------------------------------------
   v2 uses the REAL route that works: it loads the watch page,
   reads ytInitialPlayerResponse from the HTML (playability OK,
   60 formats), and serves:

     GET /health                         liveness
     GET /api/info?v=ID                  title + quality ladder
     GET /api/formats?v=ID&quality=N     {video:{url,..}, audio:{url,..}}
     GET /api/download?v=ID&type=audio   direct audio stream
     GET /api/transcript?v=ID            timed captions JSON

   The Render server asks this worker for the format URLs and
   merges video+audio with ffmpeg there, because a worker has no
   transcoder. /api/formats exists exactly for that hand-off.

   Zero dependencies. Deploy: Cloudflare dashboard -> Workers &
   Pages -> Create -> Worker -> paste -> Deploy. Free tier.
   Then on Render set REMOTE_ENGINE_URL = https://<name>.workers.dev
   ============================================================ */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const cache = new Map(); // videoId -> {t: timestamp, player: <parsed json>}

function json(status, obj, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{6,}$/.test(id);
}

function extractVideoId(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/(?:v=|\/(?:watch|embed|shorts|v)\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function bytesText(n) {
  if (!n || !isFinite(n) || n <= 0) return "";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " GB";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  return Math.round(n / 1e3) + " KB";
}

function durationText(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}

/* ---------- extract the balanced {...} JSON object ---------- */

function extractJsonObject(str, startIdx) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startIdx; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return str.slice(startIdx, i + 1);
    }
  }
  return null;
}

/* ---------- load the player response (cached 10 min) ---------- */

async function playerFor(videoId) {
  const hit = cache.get(videoId);
  if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.player;

  const r = await fetch("https://www.youtube.com/watch?v=" + videoId + "&hl=en", {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!r.ok) throw new Error("watch page " + r.status);
  const t = await r.text();
  const marker = t.indexOf("ytInitialPlayerResponse");
  if (marker < 0) throw new Error("YouTube refused this request (no player response in page).");
  const brace = t.indexOf("{", marker);
  const raw = extractJsonObject(t, brace);
  if (!raw) throw new Error("Could not read the player response.");
  const player = JSON.parse(raw);

  const st = player.playabilityStatus && player.playabilityStatus.status;
  if (st !== "OK") {
    const reason = player.playabilityStatus && (player.playabilityStatus.reason || st);
    throw new Error("YouTube: " + reason);
  }
  cache.set(videoId, { t: Date.now(), player });
  return player;
}

function fmtList(entry) {
  return {
    itag: entry.itag,
    mime: String(entry.mimeType || "").split(";")[0],
    height: entry.height || 0,
    fps: entry.fps || 24,
    size: Number(entry.contentLength) || 0,
    bitrate: entry.bitrate || 0,
    url: entry.url || "",
    audioChannels: entry.audioChannels || 0,
    audioSampleRate: entry.audioSampleRate || 0,
  };
}

/* ---------- /api/info ---------- */

const LADDER = [
  { h: 2160, l: "4K" }, { h: 1440, l: "1440p" }, { h: 1080, l: "1080p" },
  { h: 720, l: "720p" }, { h: 480, l: "480p" }, { h: 360, l: "360p" },
  { h: 240, l: "240p" }, { h: 144, l: "144p" },
];

async function handleInfo(videoId) {
  let player;
  try {
    player = await playerFor(videoId);
  } catch (e) {
    return json(502, { ok: false, error: e.message || "Could not read this video." });
  }

  const vd = player.videoDetails || {};
  const sd = player.streamingData || {};
  const all = (sd.formats || []).concat(sd.adaptiveFormats || []).map(fmtList);
  const videos = all.filter((f) => /^video\//.test(f.mime) && !f.audioChannels);
  const audios = all.filter((f) => /^audio\//.test(f.mime));

  const qualities = [];
  for (const rung of LADDER) {
    const f = videos.filter((x) => x.height <= rung.h).sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0];
    if (!f) continue;
    qualities.push({
      label: rung.l,
      value: String(rung.h),
      height: rung.h,
      fps: f.fps || 24,
      size: f.size || 0,
      sizeText: bytesText(f.size),
    });
  }

  const audioFormat =
    audios.filter((a) => /m4a|aac/i.test(a.mime)).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] ||
    audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  const audioBitrates = audioFormat
    ? [{ label: Math.max(64, Math.min(320, Math.round((audioFormat.bitrate || 128) / 1000))) + " kbps", value: String(Math.max(64, Math.min(320, Math.round((audioFormat.bitrate || 128) / 1000)))) }]
    : [];

  return json(200, {
    ok: true,
    videoId,
    title: vd.title || "Video",
    author: vd.author || "",
    thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg",
    duration: Number(vd.lengthSeconds) || null,
    durationText: durationText(vd.lengthSeconds),
    qualities,
    audioBitrates,
    audioExt: audioFormat ? audioFormat.mime.split("/")[1].split(";")[0] : "m4a",
    audioSourceSize: audioFormat ? audioFormat.size : 0,
    audioSourceSizeText: audioFormat ? bytesText(audioFormat.size) : "",
    ffmpeg: false,
    engine: "savetube-worker-v2",
  });
}

/* ---------- /api/formats (URL pair for server-side merge) ---------- */

async function handleFormats(videoId, quality) {
  let player;
  try {
    player = await playerFor(videoId);
  } catch (e) {
    return json(502, { ok: false, error: e.message || "Could not read this video." });
  }
  const vd = player.videoDetails || {};
  const sd = player.streamingData || {};
  const all = (sd.formats || []).concat(sd.adaptiveFormats || []).map(fmtList);
  const videos = all.filter((f) => /^video\//.test(f.mime) && !f.audioChannels);
  const audios = all.filter((f) => /^audio\//.test(f.mime));

  const wanted = Number(quality) || 720;
  const video =
    videos.filter((f) => f.height <= wanted).sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0] ||
    videos.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0];
  const audio =
    audios.filter((a) => /m4a|aac/i.test(a.mime)).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] ||
    audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  if (!video || !audio || !video.url || !audio.url) {
    return json(502, { ok: false, error: "No playable formats for this video." });
  }

  return json(200, {
    ok: true,
    videoId,
    title: vd.title || "Video",
    video: {
      url: video.url,
      mime: video.mime,
      height: video.height,
      fps: video.fps,
      size: video.size,
      bitrate: video.bitrate,
    },
    audio: {
      url: audio.url,
      mime: audio.mime,
      bitrate: audio.bitrate,
      size: audio.size,
    },
  });
}

/* ---------- /api/download ----------
   audio: direct stream of the original track (real, playable).
   video: video-only stream, no sound (the server merges instead;
          kept here only as a fallback so the route always answers). */

async function streamOut(f, videoId, filename, note) {
  if (!f || !f.url) return json(502, { ok: false, error: "No stream available." });
  const up = await fetch(f.url, { headers: { "User-Agent": UA } });
  if (!up.ok || !up.body) throw new Error("media " + up.status);
  const headers = new Headers(CORS);
  headers.set("Content-Disposition", 'attachment; filename="' + filename.replace(/["\r\n]/g, "") + '"');
  headers.set("Content-Type", up.headers.get("content-type") || f.mime || "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  const cl = up.headers.get("content-length") || (f.size ? String(f.size) : "");
  if (cl) headers.set("Content-Length", cl);
  headers.set("X-SaveTube-Cache", "miss");
  if (note) headers.set("X-SaveTube-Note", note);
  return new Response(up.body, { status: 200, headers });
}

async function handleDownload(videoId, type, quality) {
  let player;
  try {
    player = await playerFor(videoId);
  } catch (e) {
    return json(502, { ok: false, error: e.message || "Could not read this video." });
  }
  const vd = player.videoDetails || {};
  const sd = player.streamingData || {};
  const all = (sd.formats || []).concat(sd.adaptiveFormats || []).map(fmtList);
  const base = (vd.title || "video").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 90) + "-" + videoId;

  if (type === "audio") {
    const audio =
      all.filter((a) => /^audio\//.test(a.mime) && /m4a|aac/i.test(a.mime)).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] ||
      all.filter((a) => /^audio\//.test(a.mime)).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    if (!audio) return json(502, { ok: false, error: "No audio track for this video." });
    const ext = audio.mime.split("/")[1].split(";")[0] || "m4a";
    return await streamOut(audio, videoId, base + "." + ext, "audio stream (" + ext + ")");
  }

  const wanted = Number(quality) || 720;
  const video =
    all.filter((f) => /^video\//.test(f.mime) && !f.audioChannels && f.height <= wanted)
      .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0] ||
    all.filter((f) => /^video\//.test(f.mime) && !f.audioChannels)
      .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0];
  if (!video) return json(502, { ok: false, error: "No video format available." });
  const ext = video.mime.split("/")[1].split(";")[0] || "mp4";
  return await streamOut(video, videoId, base + "." + ext, "video-only stream, no audio track (server merge normally used)");
}

/* ---------- /api/transcript ---------- */

async function handleTranscript(videoId) {
  let player;
  try {
    player = await playerFor(videoId);
  } catch (e) {
    return json(502, { ok: false, error: e.message || "Could not read this video." });
  }
  const vd = player.videoDetails || {};
  const caps =
    (vd.captions && vd.captions.playerCaptionsTracklistRenderer && vd.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
  const track = caps[0];
  if (!track) return json(200, { ok: true, lang: "", lines: [], empty: true, error: "This video has no captions." });

  const res = await fetch(track.baseUrl);
  if (!res.ok) return json(502, { ok: false, error: "Could not fetch captions." });
  const xml = await res.text();

  const lines = [];
  const re = /<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>(.*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml))) {
    lines.push({
      start: Math.round(Number(m[1]) * 100) / 100,
      dur: Math.round((Number(m[2]) || 3) * 100) / 100,
      text: String(m[3])
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/<[^>]+>/g, ""),
    });
  }

  return json(200, { ok: true, lang: track.languageCode || "", lines });
}

/* ---------- router ---------- */

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });

    const token = (env && env.REMOTE_ENGINE_TOKEN) || "";
    if (token && u.pathname.startsWith("/api/") && request.headers.get("x-engine-token") !== token) {
      return json(403, { ok: false, error: "Engine token required." });
    }

    if (u.pathname === "/health") return json(200, { ok: true, ffmpeg: false, engine: "savetube-worker-v2" });

    if (u.pathname === "/api/info") {
      const id = u.searchParams.get("v") || extractVideoId(u.searchParams.get("url") || "");
      if (!validId(id)) return json(400, { ok: false, error: "Bad video id." });
      return await handleInfo(id);
    }

    if (u.pathname === "/api/formats") {
      const id = u.searchParams.get("v") || extractVideoId(u.searchParams.get("url") || "");
      if (!validId(id)) return json(400, { ok: false, error: "Bad video id." });
      return await handleFormats(id, u.searchParams.get("quality") || "720");
    }

    if (u.pathname === "/api/download") {
      const id = u.searchParams.get("v") || extractVideoId(u.searchParams.get("url") || "");
      if (!validId(id)) return json(400, { ok: false, error: "Bad video id." });
      const type = u.searchParams.get("type") === "audio" ? "audio" : "video";
      return await handleDownload(id, type, u.searchParams.get("quality") || "720");
    }

    if (u.pathname === "/api/transcript") {
      const id = u.searchParams.get("v") || extractVideoId(u.searchParams.get("url") || "");
      if (!validId(id)) return json(400, { ok: false, error: "Bad video id." });
      return await handleTranscript(id);
    }

    return json(404, { ok: false, error: "Not found" });
  },
};