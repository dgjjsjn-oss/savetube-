# SaveTube

A free YouTube video and audio downloader. Paste a link, pick a quality,
save the file — or cut out just the part of the video you need.

Built as a real service: the files are prepared on your own server and
delivered from your own domain, so there is no redirect to somebody else's
website and no third party in the middle.

## What it does

- **Video downloads** in up to 4K, 1440p, 1080p, 720p, 480p, 360p or 144p —
  only the qualities the video actually offers are shown.
- **Audio extraction** to MP3 at 64, 128, 192, 256 or 320 kbps.
- **Timeline cut** — download only the section you want, by giving a start
  time and an end time. Cuts are frame-accurate.
- **Transcripts** with timestamps for videos that publish subtitles.
- **Auto dark mode** that follows the device setting, with a manual toggle
  whose choice is remembered on that device only.
- **Live download progress** with a real percentage, so a download never
  looks frozen.

## Pages included

Home, About, How to use, Contact (working form), Privacy Policy, Terms of
Service, Cookie Policy, Copyright Policy, Disclaimer and a 404 page. Every
policy page is written out in full, and the footer carries a
Cookie settings link that lets a visitor change their choice at any time.

## Advertising

Ads are gated behind cookie consent. Nothing from an ad network is loaded
until the visitor accepts — no scripts, no iframes, no tracking. Two banner
slots are reserved with real dimensions so a banner cannot collapse the
layout, and there is an optional click-anywhere pop-up with a per-visit cap
and a minimum gap between pop-ups so visitors are not driven away.

Paste your network code into the two marked blocks in `index.html`, and your
direct link into `js/config.js`.

## Redirect and referral links

`links.json` holds short addresses on your own domain that forward to your
referral or affiliate links. They keep working when the destination changes,
which makes them safe to put in bios, comments and other websites.

```
node addlink.js add youtube https://example.com/?ref=you "Subscribe"
node addlink.js list
node addlink.js off youtube
node addlink.js remove youtube
```

Each link is then live at `/go/<slug>`. A private click counter is at
`/go-stats?key=...` — the key is printed when the server starts.

## Running it

```
node server.js
```

Optional environment variables: `PORT`, `MAX_CONCURRENT`,
`CONCURRENT_FRAGMENTS`, `TRUST_PROXY`, `STATS_KEY`.

Requires `yt-dlp` and `ffmpeg` on the PATH, or bundled in `tools/`.

## Privacy and safety built in

- No accounts, no database, no download history.
- Visitor addresses are hashed before they are used for rate limiting, so
  the server never holds a list of raw IP addresses.
- `X-Forwarded-For` is ignored unless `TRUST_PROXY=1`, so nobody can spoof
  their way past the rate limiter.
- Temporary files are deleted after delivery.
- Source files, config data and click counts are blocked from being served
  as static files.
- Rate limiting, connection caps and security headers are on by default.

## Built with

Plain HTML, CSS and JavaScript on the front end. Node.js with no npm
dependencies on the back end. `yt-dlp` and `ffmpeg` do the media work.

## Disclaimer

SaveTube is not affiliated with YouTube or Google. Download content you have
the right to save. See the Disclaimer and Copyright Policy pages.
