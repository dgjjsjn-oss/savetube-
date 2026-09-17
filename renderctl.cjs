/* Render service controller.
   Reads the account's API key from the RENDER_API_KEY environment variable -
   it is never written to disk and never leaves this machine except to call
   Render's own API.

   Usage:
     set RENDER_API_KEY=rnd_xxxx
     node renderctl.cjs status
     node renderctl.cjs resume
     node renderctl.cjs deploys
*/

const KEY = process.env.RENDER_API_KEY || "";
const SERVICE = "srv-dam20fqjnfac73d13jm0";
const BASE = "https://api.render.com/v1";

if (!KEY) {
  console.log("");
  console.log("  RENDER_API_KEY is not set.");
  console.log("");
  console.log("  Create one at: https://dashboard.render.com/settings#api-keys");
  console.log("  Then run:");
  console.log('    $env:RENDER_API_KEY="rnd_your_key_here"');
  console.log("    node renderctl.cjs status");
  console.log("");
  process.exit(0);
}

async function api(path, method) {
  const r = await fetch(BASE + path, {
    method: method || "GET",
    headers: {
      Authorization: "Bearer " + KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch (e) { body = text; }
  return { status: r.status, body };
}

(async () => {
  const cmd = (process.argv[2] || "status").toLowerCase();

  if (cmd === "status") {
    const s = await api("/services/" + SERVICE);
    if (s.status !== 200) {
      console.log("  API returned " + s.status);
      console.log("  " + JSON.stringify(s.body).slice(0, 400));
      process.exit(1);
    }
    const v = s.body;
    console.log("");
    console.log("  name        : " + v.name);
    console.log("  id          : " + v.id);
    console.log("  type        : " + v.type);
    console.log("  plan        : " + (v.serviceDetails && v.serviceDetails.plan) || "n/a");
    console.log("  suspended   : " + v.suspended);
    console.log("  autoDeploy  : " + v.autoDeploy);
    console.log("  url         : " + (v.serviceDetails && v.serviceDetails.url));
    console.log("  repo        : " + (v.repo));
    console.log("  branch      : " + (v.branch));
    console.log("");
    if (v.suspended === "suspended" || v.suspended === "suspend-by-user") {
      console.log("  >>> SUSPENDED. Run:  node renderctl.cjs resume");
    } else {
      console.log("  >>> Not suspended.");
    }
    return;
  }

  if (cmd === "resume") {
    const r = await api("/services/" + SERVICE + "/resume", "POST");
    console.log("  resume -> HTTP " + r.status);
    console.log("  " + JSON.stringify(r.body).slice(0, 400));

    const d = await api("/services/" + SERVICE + "/deploys?limit=1");
    if (d.status === 200 && Array.isArray(d.body) && d.body.length) {
      const dep = d.body[0].deploy || d.body[0];
      console.log("");
      console.log("  latest deploy: " + dep.id + "  status=" + dep.status + "  commit=" + String(dep.commit && dep.commit.id).slice(0, 7));
    }
    return;
  }

  if (cmd === "deploys") {
    const d = await api("/services/" + SERVICE + "/deploys?limit=8");
    if (d.status !== 200) {
      console.log("  API returned " + d.status + " " + JSON.stringify(d.body).slice(0, 300));
      return;
    }
    console.log("");
    d.body.forEach((row) => {
      const dep = row.deploy || row;
      console.log("  " + String(dep.id).padEnd(26) + " " + String(dep.status).padEnd(12) +
        " " + String(dep.commit && dep.commit.id).slice(0, 7) + "  " + (dep.finishedAt || dep.createdAt));
    });
    return;
  }

  if (cmd === "deploy") {
    const r = await api("/services/" + SERVICE + "/deploys", "POST", { clearCache: "do_not_clear" });
    console.log("  trigger deploy -> HTTP " + r.status);
    console.log("  " + JSON.stringify(r.body).slice(0, 400));
    return;
  }

  if (cmd === "env") {
    const e = await api("/services/" + SERVICE + "/env-vars?limit=50");
    if (e.status !== 200) {
      console.log("  API returned " + e.status + " " + JSON.stringify(e.body).slice(0, 300));
      return;
    }
    const rows = Array.isArray(e.body) ? e.body : [];
    console.log("");
    if (!rows.length) console.log("  (no environment variables set)");
    rows.forEach((row) => {
      const v = row.envVar || row;
      const val = typeof v.value === "string" ? v.value : "";
      console.log("  " + String(v.key).padEnd(24) + " = " + (val.length > 60 ? val.slice(0, 57) + "..." : val));
    });
    return;
  }

  console.log("  unknown command: " + cmd);
  console.log("  use: status | resume | deploys | deploy | env");
})();
