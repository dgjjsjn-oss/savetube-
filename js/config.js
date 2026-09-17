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
  /* Left EMPTY on purpose. This used to point at another downloader site as a
     safety net. It is removed so nobody is ever sent off your site: if the
     engine cannot be reached the page shows a message and asks people to
     retry, and every download still happens on your own domain. */
  downloadPartnerUrl: "",
  sendFormatToPartner: false,

  /* ----- TRANSCRIPT -----
     The transcript is fetched and rendered ON THIS WEBSITE by the server
     (/api/transcript). Nothing here sends the visitor to another site.

       timestampsDefault  true  = rows start with 0:42 by default
                          false = plain text by default (still switchable)
       adUrl              Paste ONE ad link here and the transcript button
                          turns into an ad click that opens it in a new tab.
                          Leave it empty and the button just copies the text.
                          Any network works (AdSense, Adsterra, Monetag...).
                          AdSense note: a direct link is not something AdSense
                          gives you - for AdSense paste a banner code into the
                          .ad-slot blocks in index.html instead, and keep your
                          Adsterra/Monetag direct link here. */
  transcript: {
    timestampsDefault: true,
    adUrl: "",                 // paste your ad direct link here
    adButtonLabel: "Copy transcript",
    adButtonLabelWithAd: "Copy transcript (supports the site)",
    adButtonNote: "Clicking opens one ad in a new tab and still copies your text. That ad view is what keeps SaveTube free.",
    revealAfterAd: true        // still give the visitor the text after the click
  },

  /* ============================================================
     UNLOCK / AD-CLICK BEHAVIOUR
     ------------------------------------------------------------
     "instant" = the FIRST click on a download button opens the ad in
                 a new tab straight away AND starts the download on
                 this site. No modal, no 3-second wait, no extra step.
     "modal"   = old style: a modal asks for one click first.
     "off"     = no ad step at all.

     Fill adUnlockUrl with ONE direct link:
       Adsterra  -> Dashboard > Direct Link
       Monetag   -> Dashboard > Smartlink > Direct Link
       PropellerAds -> Smartlink / Direct Link
     Example: adUnlockUrl: "https://www.profitableratecpm.com/xxxxxxx" */
  unlockMode: "instant",
  adUnlockUrl: "ad-example.html",

  /* ============================================================
     GOOGLE ADSENSE  (your approved account)
     ------------------------------------------------------------
     Publisher id: ca-pub-8867195022648231

     Already wired up:
       - the AdSense script is in the <head> of every page
       - ads.txt is published at /ads.txt with your publisher id
       - five ad slots on the home page request AdSense units

     TWO THINGS ONLY YOU CAN DO IN THE DASHBOARD:
       1. Auto Ads: AdSense > Ads > By site > turn Auto ads ON for your
          domain. That fills the page automatically and needs no slot ids.
       2. Manual units: AdSense > Ads > By ad unit > create a "Display"
          unit, then paste its data-ad-slot number over the placeholder
          numbers 1111111111 / 2222222222 / 3333333333 / 4444444444 /
          5555555555 in index.html.

     ============================================================
     IMPORTANT - THIS PROTECTS YOUR ADSENSE ACCOUNT
     ------------------------------------------------------------
     AdSense does NOT allow pop-unders, pop-ups or forced redirects on
     the same pages as AdSense ads. Turning popunder.enabled to true
     below while AdSense is running is the fastest way to get the
     account permanently disabled and the earnings withheld.

     Keep popunder.enabled FALSE while you are monetised with AdSense.
     Only enable it if you switch to a network that allows it
     (Adsterra / Monetag) and remove AdSense first.
     ============================================================ */
  adsense: {
    client: "ca-pub-8867195022648231",
    enabled: true
  },

  /* ============================================================
     AD POLICY  (the thing that keeps AdSense alive)
     ------------------------------------------------------------
     The rule is simple and it is not negotiable with Google:

       AdSense may share a page ONLY with ad formats that are
       visible inside the page itself - banners, native blocks,
       in-article units.

       AdSense may NEVER share a page with anything that opens
       its own window or moves the visitor without a click:
       pop-unders, click-unders, auto pop-ups, vignettes,
       interstitials, notification (in-page push) prompts,
       social bars, forced redirects.

     js/ads-policy.js enforces exactly that. It reads every ad
     snippet before it is allowed to run and refuses the second
     group while AdSense is switched on. A refused snippet is
     logged in the browser console with the reason, and the page
     keeps working normally - it simply never executes.

     "adsense-safe" is the default and it is the setting that
     keeps the account safe. The other two exist so nothing has
     to be rewritten if you ever change networks:

       "adsense-safe" - display/native only. Pop-up family blocked.
       "network-only" - pop-up family allowed. Use ONLY when the
                        AdSense script has been removed from the
                        pages (adsense.enabled false, and the
                        adsbygoogle.js tag deleted from the head).
       "off"          - no enforcing. Only for debugging.
     ============================================================ */
  adPolicy: {
    mode: "adsense-safe",
    logBlocked: true
  },

  /* ============================================================
     HILLTOPADS
     ------------------------------------------------------------
     Your verification file is already published at
     /86ac83093c307b5211aa.txt so the site can be approved.
     (dashboard: user.hilltopads.com/publisher/sites)

     After approval, HilltopAds gives you a code for EACH format.
     Only the banner / native ones belong on this site:

     SAFE on this site (visible, in-page):
       Banner, Native banner, In-article

     NEVER on this site while AdSense is on (opens its own window
     or moves the visitor without a click):
       Popunder, OnClick, Vignette, Interstitial, In-Page Push,
       Social Bar, any forced redirect


     Paste a banner/native code into the marked block near the
     bottom of index.html (search for "HILLTOPADS SLOT"). It runs
     only after the visitor accepts cookies, exactly like the
     AdSense units.

     Anything from the blocked family that gets pasted anywhere
     is caught by js/ads-policy.js and never runs while
     adPolicy.mode is "adsense-safe".
     ============================================================ */
  hilltopads: {
    enabled: true,
    verificationFile: "86ac83093c307b5211aa.txt",
    /* Optional: your publisher id, shown in ads.txt comments only. */
    publisherId: "",
    bannerCode: "",   // paste the Banner / Native code here if you prefer config over markup
    slot: "#ad-network"
  },

  /* ============================================================
     ALIAS TIP  ("add SOS to the link")
     ------------------------------------------------------------
     Shown once per visit at the moment a visitor presses Get link.
     The alias really does work: SOSyoutube.com/watch?v=ID,
     /watch?v=ID, /video/ID and /?v=ID all open the same result on
     this site, so the tip is a working link, not just text.

     For the alias DOMAIN to resolve you point it at this app with a
     free custom domain in the hosting dashboard (Render > Settings >
     Custom Domain). The server already answers for every host name,
     so once the domain points here nothing else is needed.

     Turn it off any time with enabled: false.
     ============================================================ */
  aliasHint: {
    enabled: true,
    domain: "SOSyoutube.com",
    text: "Tip: add SOS to the YouTube link and the download starts faster.",
    seconds: 9
  },

  /* ============================================================
     POP-UP / POPUNDER ADS  (click anywhere -> ad opens)
     ------------------------------------------------------------
     OFF ON PURPOSE. See the warning above: while AdSense is your
     network, leave this disabled or the AdSense account gets banned.

     If you later switch to Adsterra / Monetag instead of AdSense:
       - paste ONE of their direct links into `url`
       - set enabled: true
       - remove the AdSense script from the pages first
     ============================================================ */
  popunder: {
    enabled: false,           // keep false while AdSense is running
    url: "",                  // Adsterra / Monetag direct link
    oncePerSession: true,     // only one pop-up per visit
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
