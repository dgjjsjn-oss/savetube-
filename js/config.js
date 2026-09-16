/* ============================================================
   SaveTube - SITE CONFIG
   Everything you can control lives in this one file.
   ============================================================ */

window.SITE_CONFIG = {

  /* ----- YOUR DOMAIN -----
     Put your real address here after you get one.
     It is used for SEO links only; the site works without it. */
  domain: "https://yoursite.com",
  siteName: "SaveTube",

  /* ----- YOUR CONTACT EMAIL -----
     Used by the contact form, the legal pages and the Contact page.
     Run "node setup.js YOUR_EMAIL YOUR_URL" once and this is filled in
     everywhere automatically. */
  contactEmail: "business.support.website@proton.me",

  /* ----- DOWNLOAD ENGINE (your own server) -----
     "auto"  = the site checks for /api/info on YOUR domain.
               Found  -> REAL downloads straight from your domain
                        (no redirect, no other website).
               Missing -> it falls back to the partner below, so the
                        site still works on plain static hosting.
     "server" = always use your own engine.
     "partner"= always use the partner redirect. */
  mode: "auto",
  apiBase: "",   // "" = same domain as the site (correct when you deploy)

  /* ----- FALLBACK PARTNER (used only if there is no engine) -----
     {VIDEO_ID} and {FORMAT} are replaced automatically. */
  downloadPartnerUrl: "https://www.y2mate.guru/youtube/{VIDEO_ID}",
  sendFormatToPartner: false,

  /* ----- TRANSCRIPT PARTNER -----
     {VIDEO_ID} is replaced automatically. */
  transcriptPartnerUrl: "https://youtubetotranscript.com/transcript?v={VIDEO_ID}&current_language_code=en",

  /* ============================================================
     UNLOCK GATE - the ad step before a download
     ------------------------------------------------------------
     When a visitor picks a format, a modal opens with an
     "Unlock & Continue" button. Clicking it opens adUnlockUrl in a
     new tab; when they come back, the download runs on YOUR site.

     WHAT TO PUT HERE (real ads):
       Adsterra  -> Dashboard > Direct Link            (works instantly)
       Monetag   -> Dashboard > Smartlink > Direct Link
       PropellerAds -> Smartlink / Direct Link
     Each of those gives you a normal https://... link. Paste it here.
     Example of what it will look like:
       adUnlockUrl: "https://www.profitableratecpm.com/xxxxxxx" */
  adUnlockUrl: "ad-example.html",

  /* ============================================================
     POP-UP / POPUNDER ADS  (click anywhere -> ad opens)
     ------------------------------------------------------------
     The visitor clicks somewhere on the page and an ad opens in a
     new tab. This is the behaviour you saw on other sites.

     Fill in `url` with ONE of these:
       - your Adsterra "Direct Link"
       - your Monetag "Smartlink" / "OnClick" link
       - your PropellerAds "Direct Link"
     Then set enabled: true and it works immediately.

     KEPT CONTROLLED ON PURPOSE so visitors are not driven away:
       oncePerSession   the same visitor is never hit twice in one visit
       minSecondsBetween a hard floor between pop-ups, even across pages
       delayMs          nothing opens in the first moments on the page
       ignoreFirstClicks the first click (usually "Get Link") is exempt
       skipInside       clicks on controls never trigger an ad
       respectConsent   no pop-ups at all until cookies are accepted */
  popunder: {
    enabled: false,           // true = turn click-anywhere ads on
    url: "",                  // paste your ad network direct link here
    oncePerSession: true,     // true = only one pop-up per visit
    minSecondsBetween: 120,   // never more often than this, per visitor
    delayMs: 12000,           // wait this long after the page opens
    ignoreFirstClicks: 1,     // ignore the very first click
    respectConsent: true,     // requires the cookie banner to be accepted
    skipInside: "#video-url, #btn-start, #unlock-modal, .tab, .ad-slot, .cookie-consent, .trim-box, .format-btn, #dl-close, #theme-toggle"
  },

  /* ----- FORMATS: VIDEO -----
     The engine reports which ones a video really has, and only those
     are shown. This list is the usual ladder. */
  videoFormats: [
    { label: "4K",     quality: "2160p",  hint: "Ultra HD",             value: "2160" },
    { label: "1440p",  quality: "2K",     hint: "Sharp on large screens", value: "1440" },
    { label: "1080p",  quality: "Full HD", hint: "Best all-round",       value: "1080" },
    { label: "720p",   quality: "HD",     hint: "Smaller file",          value: "720" },
    { label: "480p",   quality: "SD",     hint: "Light and quick",       value: "480" },
    { label: "360p",   quality: "SD",     hint: "Smallest file",         value: "360" },
    { label: "240p",   quality: "Tiny",   hint: "Very small",            value: "240" }
  ],

  /* ----- FORMATS: AUDIO ----- */
  audioFormats: [
    { label: "320 kbps", quality: "Best",     hint: "Highest audio quality",  value: "320" },
    { label: "256 kbps", quality: "High",     hint: "Great quality, smaller", value: "256" },
    { label: "192 kbps", quality: "Good",     hint: "Balanced",               value: "192" },
    { label: "128 kbps", quality: "Standard", hint: "Small file",             value: "128" },
    { label: "64 kbps",  quality: "Low",      hint: "Tiny file",              value: "64" }
  ],

  /* ----- AD SLOTS -----
     Banner/popunder <script> blocks from Adsterra / Monetag go into
     the .ad-slot divs in index.html (marked with comments there). */
  showAdSlots: true,

  /* ============================================================
     YOUR REDIRECT / REFERRAL LINKS
     ------------------------------------------------------------
     Short addresses on your own site that forward to your referral
     or affiliate links. These are the links you paste into bios,
     comments, messages and other websites.

     Manage them with:
       node addlink.js list
       node addlink.js add youtube https://example.com/?ref=me "Subscribe"

     Each one then works as:
       https://yourdomain.com/go/youtube

     The list itself lives in links.json. See the private click
     counter at /go-stats?key=... (the key is printed when the
     server starts). */
  redirectBase: "/go/"
};
