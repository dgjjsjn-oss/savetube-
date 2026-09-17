# SaveTube - one-click deploy image.
# Contains Node.js + yt-dlp + ffmpeg so real downloads work on the host.
FROM node:20-slim

# Install yt-dlp + ffmpeg + deno
# deno is the JavaScript runtime yt-dlp now uses to solve YouTube's player
# challenge. Without one, extraction is deprecated and videos increasingly
# come back as "Failed to extract any player response".
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip ffmpeg ca-certificates curl unzip \
    && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y \
    && ln -sf /usr/local/bin/deno /usr/bin/deno \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure yt-dlp can find deno regardless of how the shell resolves PATH.
ENV DENO_INSTALL="/usr/local"
ENV PATH="/usr/local/bin:${PATH}"

WORKDIR /app

COPY package.json ./
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
