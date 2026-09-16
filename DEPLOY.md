# Deploy SaveTube for free (no laptop needed)

The engine needs to run somewhere that stays online. Below are the free
options that actually work, easiest first. **You do not need your laptop
on, and you do not need to pay anything.**

You only need one thing: a free GitHub account (for Render) — or no
account tricks at all if you use Hugging Face.

---

## What the server must be able to do

The engine is a small Node.js program that also uses two free tools:
`yt-dlp` (the downloader) and `ffmpeg` (joins video + audio, makes MP3).

That is what the **Dockerfile** in this folder is for — it installs all
three automatically. Any host that runs Docker works.

---

## Option A — Render (recommended, 5 minutes)

Free, gives you a live URL immediately, no credit card.

1. Make a free account at **https://render.com**
2. Put this project on GitHub:
   - Create a free account at **https://github.com**
   - Click **New repository** → name it `savetube` → **Create**
   - Upload every file from this folder (drag and drop works)
3. In Render: **New** → **Web Service** → **Build and deploy from a Git repository** → pick `savetube`
4. Fill in:
   - **Runtime**: Docker (Render detects the Dockerfile automatically)
   - **Instance type**: Free
   - **Health check path**: `/health`
5. Click **Create Web Service**

After a few minutes you get a live address like:

```
https://savetube.onrender.com
```

**That is your website.** Open it, paste a video link, download — the file
comes from your own server to the visitor's device.

> Free tier note: the free instance sleeps after ~15 minutes with no
> visitors. The next visit wakes it up and takes about 30–60 seconds.
> That is normal on the free plan.

---

## Option B — Hugging Face Spaces (free, no credit card, more RAM)

1. Make a free account at **https://huggingface.co**
2. **New** → **Space**
3. Name it `savetube`, **SDK: Docker**, visibility Public → **Create**
4. Upload every file from this folder into the Space
5. Rename `deploy/README.huggingface.md` content into the Space's `README.md`
   (the Space README must start with the `---` settings block)

Your site becomes:

```
https://huggingface.co/spaces/YOURNAME/savetube
```

The app itself runs at the direct URL shown on the Space page
(`https://YOURNAME-savetube.hf.space`).

Free Spaces are generous on RAM and stay awake for long stretches.

---

## Option C — Koyeb (free hobby instance)

1. Account at **https://app.koyeb.com** (GitHub login works)
2. **Create Service** → **GitHub** → pick your `savetube` repo
3. Builder: **Dockerfile** · Instance: **Free** · Port: **8080**
4. Deploy. You get a `*.koyeb.app` address.

---

## Option D — Oracle Cloud Always Free (best result, needs a card for ID check)

This is a **real server** that runs 24/7 forever for free (no sleeping):

1. Sign up at **https://www.oracle.com/cloud/free/**
   (a card is requested to verify identity — the Always Free tier is not charged)
2. Create an **Always Free** VM (Ampere ARM, 1 OCPU / 6 GB is free forever)
3. Choose Ubuntu, open ports **80** and **443**
4. Connect and run:

```bash
sudo apt update
sudo apt install -y python3-pip ffmpeg git
pip3 install -U yt-dlp
git clone YOUR_REPO_URL savetube
cd savetube
node server.js        # or use pm2 to keep it running: npm i -g pm2 && pm2 start server.js
```

5. Point your domain at the server's IP.

This is the option where everything is fully yours: your domain, your
server, no sleeping, no limits.

---

## About Vercel

Vercel is excellent for websites, but its free plan cuts off a request
after about 10 seconds. Preparing a video usually takes longer than that,
so long downloads would fail.

If you still want Vercel: use it to host the **site**, and put the engine
on Render/Oracle. Set `apiBase` in `js/config.js` to your engine address.

---

## Your free domain

You do not need to buy anything.

| What | Where | Cost | Notes |
|---|---|---|---|
| `savetube.onrender.com` | Render gives it automatically | Free | Works instantly |
| `yourname.hf.space` | Hugging Face gives it automatically | Free | Works instantly |
| `yourname.eu.org` | https://nic.eu.org → register → request domain | Free | A real domain. Approval takes a few days |
| `yourname.is-a.dev` | https://www.is-a.dev via GitHub | Free | Developer-style, quick approval |
| `yourname.xyz` / `.top` | Namecheap / Porkbun promos | ~$1–3 | Only if you ever have a little money |

**Ad networks prefer a real domain like `eu.org`.** Free subdomains are
often accepted too — apply with what you have, then upgrade to `eu.org`.
Point the domain at your host with a CNAME record (your host shows you
the exact value to paste).

---

## Getting real ads (and getting approved)

You must have a **live site with the legal pages** before applying. This
project already includes everything they check:

- Privacy Policy, Terms, Cookie Policy, Disclaimer, Copyright Policy
- About page, Contact page with email addresses, How-to-use page
- Cookie consent banner that blocks ads until the visitor agrees

### Best networks for someone with no bank account

| Network | Payout | Minimum | Formats |
|---|---|---|---|
| **Monetag** | Crypto, PayPal, Payoneer | Low | Popunder, banners, vignette |
| **Adsterra** | USDT crypto, WebMoney, Payoneer, PayPal | ~$100 | Banners, popunder, direct links |
| **PropellerAds** | USDT crypto, Payoneer | ~$50 | Popunder, push, smartlink |

All three pay by crypto, so a bank account is not required.

### Sign up and get your ad links

1. Register at **https://monetag.com** (easiest for beginners)
2. In the dashboard create:
   - a **Smartlink / Direct link** → this is a normal `https://...` address
   - a **Popunder / OnClick** zone → also gives you an address
   - a **Banner** zone → gives you a small `<script>` block
3. Paste them into the project:

```
js/config.js

  adUnlockUrl: "YOUR SMARTLINK OR DIRECT LINK HERE",

  popunder: {
    enabled: true,                  <- turn click-anywhere ads on
    url: "YOUR POPUNDER LINK HERE",
    ...
  },
```

4. Paste the banner `<script>` block into `index.html` where it says
   `PASTE YOUR TOP BANNER CODE HERE` and `PASTE YOUR BOTTOM BANNER CODE HERE`
   (inside the `<script type="text/plain" data-consent="ads">` block).

Those blocks only run **after cookie consent**, which is what keeps the
site compliant.

### Where the money comes from

- Every download or transcript passes the **unlock step** → one ad view each
- Clicks anywhere on the page can also open a **pop-under** (popunder.url)
- Banner impressions add a smaller amount

That is your "at least 100 clicks per 100 visitors" setup.

### Approval tips

- Apply with your **live URL**, not a local file
- Make sure **Contact** shows a working email address (see below)
- Make sure the site loads fast and has no broken links
- Apply **after** the site has been online for a few days if you can
- Never claim the site hosts the videos — it does not, and the policies say so

---

## You need one email — here is how to get one free, no phone

Ad networks check that visitors can reach you, so the site must show a real
address. You do **not** need a Gmail. These are free and do not require an
existing email or a phone number in most cases:

| Service | Address | Notes |
|---|---|---|
| **Proton Mail** | proton.me | Free 1 GB. Usually just a captcha. Best first choice. |
| **Tuta** | tuta.com | Free, no phone needed. Privacy-focused. |
| **GMX** | gmx.com | Free, no phone needed in most countries. |
| **mail.com** | mail.com | Free, pick a name from many domains. |

Pick one, sign up, and you have an address like `savetube.help@proton.me`.
One address is enough for the whole site — you do not need a separate one
for support, privacy and copyright.

**Do not want to sign up anywhere at all?** Then use the free
form at **https://formsubmit.co** with any address you already own
(or the one above). The contact form on the Contact page is already wired to
it — you only replace the email once and messages arrive in that inbox. The
very first message triggers a one-time confirmation link from FormSubmit;
click it once and every message after that is delivered.

---

## Then run the setup command (this fills everything in)

Open PowerShell in this folder and run:

```powershell
node setup.js YOUR_EMAIL YOUR_URL
```

Example:

```powershell
node setup.js savetube.help@proton.me https://savetube.onrender.com
```

That single command fills your email and address into every page, the
sitemap, `robots.txt`, the contact form and `js/config.js`.
Run it again any time you change your email or your address — it just
updates the old values.

---

## Replace these placeholders before you go live

1. **Emails** — handled by `node setup.js` above.
   Until then the pages show `support@yoursite.com`, `copyright@yoursite.com`,
   `ads@yoursite.com` and `privacy@yoursite.com`.

2. **Domain** — also handled by `node setup.js`.

3. **Ads** — `adUnlockUrl` + `popunder.url` in `js/config.js`, and the banner
   blocks in `index.html`.

4. **Old-style manual replace** (only if you ever want to do it by hand):

   ```powershell
   Get-ChildItem -Recurse -Include *.html,*.xml,js\config.js |
     ForEach-Object {
       (Get-Content $_.FullName -Raw) -replace 'https://yoursite\.com','https://YOUR-DOMAIN' |
       Set-Content $_.FullName -NoNewline
     }
   ```

---

## Files that must never be public

These are build/deploy files and the server already returns `404` for them,
so nothing has to be done: `setup.js`, `server.js`, `package.json`,
`Dockerfile`, `render.yaml`, `Procfile`, `DEPLOY.md`, `deploy/`, `.gitignore`.

---

## Done checklist

- [ ] Host deployed, `/health` shows `{"ok":true}`
- [ ] Site opens, badge says "Direct download"
- [ ] Paste a link → Get Link → real title appears
- [ ] Pick a quality → unlock → a real video file saves to the device
- [ ] Legal pages all open (About, FAQ, Contact, Privacy, Terms, Cookies, Copyright, Disclaimer)
- [ ] Cookie banner appears; declining blocks ads; accepting loads them
- [ ] Emails and domain replaced
- [ ] Applied to Monetag / Adsterra and pasted the links
