// SaveTube Core - the fast C++ helper used by the Node server.
//
// The heavy string work of every download (filename sanitization, YouTube
// n-sig decipher op execution, duration/size formatting) runs here at
// machine speed instead of inside the JavaScript event loop.
//
// Compile (Windows):  g++ -O2 -std=c++17 -o tools/savetube_core.exe tools/savetube_core.cpp
// Compile (Linux):    g++ -O2 -std=c++17 -o tools/savetube_core tools/savetube_core.cpp
//
// Subcommands:
//   sanitize "<name>"                    -> filesystem-safe filename (no path chars)
//   applyops '<ops-json>' "<signature>"  -> YouTube n-sig decipher result
//   fmtbytes <bytes>                     -> "117.7 MB"
//   fmtdur <seconds>                     -> "1:25" / "1:02:03"
//   base64url "<value>"                  -> URL-safe base64 decode (raw bytes)
//
// Exit codes: 0 on success, 1 on bad input. Output goes to stdout.

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>
#include <cmath>

#if defined(_WIN32)
#include <windows.h>
#else
#include <unistd.h>
#endif

// ---------------------------------------------------------------- helpers

static std::string trim(const std::string& s) {
  size_t a = s.find_first_not_of(" \t\r\n");
  if (a == std::string::npos) return "";
  size_t b = s.find_last_not_of(" \t\r\n");
  return s.substr(a, b - a + 1);
}

static void writeOut(const std::string& s) {
#if defined(_WIN32)
  fwrite(s.data(), 1, s.size(), stdout);
  // Ensure the byte stream survives Windows' console translation.
  fflush(stdout);
#else
  fwrite(s.data(), 1, s.size(), stdout);
  fflush(stdout);
#endif
}

// ------------------------------------------------------------- sanitize

// Same contract as the server's safeFilename: keep letters, numbers, spaces,
// and a small friendly set; replace everything else with '-'; collapse runs
// of '-'; trim; cap length; never empty or path-traversal ("..").
static std::string sanitize(const std::string& raw) {
  std::string out;
  out.reserve(raw.size());
  bool lastDash = false;
  for (unsigned char ch : raw) {
    bool keep = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
                (ch >= '0' && ch <= '9') || ch == ' ' || ch == '_' ||
                ch == '.' || ch == '-' || ch == '(' || ch == ')';
    if (keep) {
      out.push_back(static_cast<char>(ch));
      lastDash = false;
    } else if (!lastDash) {
      out.push_back('-');
      lastDash = true;
    }
  }
  // strip leading/trailing dashes and dots
  size_t a = out.find_first_not_of("-.");
  if (a == std::string::npos) return "video";
  size_t b = out.find_last_not_of("-.");
  out = out.substr(a, b - a + 1);
  // path traversal guard
  if (out == ".." || out == ".") return "video";
  // collapse internal ".." like "a..b" -> "a-b"
  std::string cleaned;
  cleaned.reserve(out.size());
  bool prevDot = false;
  for (char ch : out) {
    if (ch == '.') {
      if (prevDot) { cleaned.push_back('-'); prevDot = false; }
      else { cleaned.push_back(ch); prevDot = true; }
    } else {
      cleaned.push_back(ch);
      prevDot = false;
    }
  }
  out = cleaned;
  if (out.empty()) return "video";
  if (out.size() > 120) out = out.substr(0, 120);
  return out;
}

// ------------------------------------------------------------ applyops

// YouTube's signature decipher algorithm is a small set of string
// operations. The server parses the player script and sends the op list as
// JSON; this function executes it with std::string at native speed.
//
// ops: [ {"op":"reverse"}, {"op":"splice","n":4}, {"op":"swap","n":1}, ... ]
//
// Returns the deciphered signature, or the original if no ops run.

static std::string applyOps(const std::string& opsJson, const std::string& sig) {
  std::string s = sig;
  // Minimal JSON array scanner: find "op":..., then optional "n":N.
  size_t pos = 0;
  while (pos < opsJson.size()) {
    size_t opPos = opsJson.find("\"op\"", pos);
    if (opPos == std::string::npos) break;
    size_t valPos = opPos + 4;
    size_t colon = opsJson.find(':', valPos);
    if (colon == std::string::npos) break;
    size_t q1 = opsJson.find('"', colon);
    if (q1 == std::string::npos) break;
    size_t q2 = opsJson.find('"', q1 + 1);
    if (q2 == std::string::npos) break;
    std::string op = opsJson.substr(q1 + 1, q2 - q1 - 1);

    long n = 0;
    size_t nPos = opsJson.find("\"n\"", q2);
    if (nPos != std::string::npos && nPos < opsJson.size()) {
      size_t c2 = opsJson.find(':', nPos);
      if (c2 != std::string::npos) {
        size_t start = c2 + 1;
        while (start < opsJson.size() && (opsJson[start] == ' ')) start++;
        long acc = 0;
        bool neg = false;
        size_t i = start;
        if (i < opsJson.size() && opsJson[i] == '-') { neg = true; i++; }
        bool any = false;
        while (i < opsJson.size() && opsJson[i] >= '0' && opsJson[i] <= '9') {
          acc = acc * 10 + (opsJson[i] - '0');
          i++; any = true;
        }
        if (any) n = neg ? -acc : acc;
      }
    }

    if (op == "reverse") {
      std::string r(s.rbegin(), s.rend());
      s = r;
    } else if (op == "splice") {
      if (n < 0) { n = 0; }
      if (n > static_cast<long>(s.size())) n = static_cast<long>(s.size());
      s = s.substr(static_cast<size_t>(n));
    } else if (op == "swap") {
      if (n < 0) n = 0;
      if (static_cast<size_t>(n) < s.size() && s.size() > 1) {
        std::swap(s[static_cast<size_t>(n)], s[s.size() - 1 - static_cast<size_t>(n)]);
      }
    }
    // n-sig ops: slice(N) is splice with a negative-signal? keep generic:
    else if (op == "slice") {
      if (n < 0) {
        long cut = static_cast<long>(s.size()) + n;
        if (cut < 0) cut = 0;
        s = s.substr(0, static_cast<size_t>(cut));
      } else {
        if (n > static_cast<long>(s.size())) n = static_cast<long>(s.size());
        s = s.substr(0, static_cast<size_t>(n));
      }
    }

    pos = q2 + 1;
  }
  return s;
}

// ------------------------------------------------------------ formatting

static std::string fmtBytes(long long bytes) {
  if (bytes < 1024) return std::to_string(bytes) + " B";
  const char* units[] = { "KB", "MB", "GB", "TB" };
  double v = static_cast<double>(bytes) / 1024.0;
  int u = 0;
  while (v >= 1024.0 && u < 3) { v /= 1024.0; u++; }
  char buf[64];
  std::snprintf(buf, sizeof(buf), "%.1f %s", v, units[u]);
  return buf;
}

static std::string fmtDur(long long sec) {
  if (sec < 0) sec = 0;
  long long h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60;
  char buf[64];
  if (h) std::snprintf(buf, sizeof(buf), "%lld:%02lld:%02lld", h, m, s);
  else   std::snprintf(buf, sizeof(buf), "%lld:%02lld", m, s);
  return buf;
}

// ----------------------------------------------------------- base64url

static int b64Val(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '-' || c == '+') return 62;
  if (c == '_' || c == '/') return 63;
  return -1;
}

static std::string base64urlDecode(const std::string& in) {
  std::string out;
  out.reserve(in.size() * 3 / 4 + 4);
  int buf = 0, bits = 0;
  for (char c : in) {
    if (c == '=') break;
    int v = b64Val(c);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push_back(static_cast<char>((buf >> bits) & 0xFF));
    }
  }
  return out;
}

// ----------------------------------------------------------------- main

int main(int argc, char** argv) {
  if (argc < 2) { return 1; }
  std::string cmd = argv[1];

  if (cmd == "sanitize" && argc >= 3) {
    writeOut(sanitize(argv[2]));
    return 0;
  }
  if (cmd == "applyops" && argc >= 2) {
    // Ops JSON arrives on stdin line 1, the signature on line 2. Passing JSON
    // as an argv string is fragile across Windows/PowerShell quoting; stdin is
    // shell-safe and matches how Node spawns us with `input`.
    std::string line, opsJson, sig;
    int lineNo = 0;
    while (std::getline(std::cin, line)) {
      if (lineNo == 0) opsJson = line;
      else if (lineNo == 1) sig = line;
      lineNo++;
    }
    writeOut(applyOps(opsJson, sig));
    return 0;
  }
  if (cmd == "fmtbytes" && argc >= 3) {
    writeOut(fmtBytes(std::strtoll(argv[2], nullptr, 10)));
    return 0;
  }
  if (cmd == "fmtdur" && argc >= 3) {
    writeOut(fmtDur(std::strtoll(argv[2], nullptr, 10)));
    return 0;
  }
  if (cmd == "base64url" && argc >= 3) {
    writeOut(base64urlDecode(argv[2]));
    return 0;
  }
  return 1;
}