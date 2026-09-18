# SaveTube - one-click deploy image.
# Contains Node.js + yt-dlp + ffmpeg + whisper so real downloads AND
# transcripts for every video (even with zero captions) work on the host.
FROM node:20-slim

# Install yt-dlp + ffmpeg + deno + g++ + faster-whisper
# deno is the JavaScript runtime yt-dlp now uses to solve YouTube's player
# challenge. Without one, extraction is deprecated and videos increasingly
# come back as "Failed to extract any player response".
# g++ builds the native savetube_core helper (filename sanitization, YouTube
# n-sig decipher ops, size/duration formatting) at machine speed.
# faster-whisper transcribes videos that have no captions at all, so the
# transcript button works for EVERY video, exactly like y2mate.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-pip-whl ffmpeg ca-certificates curl unzip g++ \
    && pip3 install --no-cache-dir --break-system-packages -U yt-dlp faster-whisper \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y \
    && ln -sf /usr/local/bin/deno /usr/bin/deno \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure yt-dlp can find deno regardless of how the shell resolves PATH.
ENV DENO_INSTALL="/usr/local"
ENV PATH="/usr/local/bin:${PATH}"
ENV VIRTUAL_ENV="/usr/local"
# faster-whisper writes a small cache for its model files; keep it in /tmp.
ENV HF_HOME="/tmp/hf-cache"

WORKDIR /app

COPY package.json ./
COPY . .

# Compile the native helper when present. The server already falls back to
# its pure-JS twins, so a missing source file must NEVER break the deploy.
RUN if [ -f /app/tools/savetube_core.cpp ]; then \
      g++ -O2 -std=c++17 -o /app/tools/savetube_core /app/tools/savetube_core.cpp \
      && chmod +x /app/tools/savetube_core \
      || echo "WARN: savetube_core compile failed - JS fallbacks in use"; \
    else \
      echo "WARN: tools/savetube_core.cpp missing - JS fallbacks in use"; \
    fi

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]