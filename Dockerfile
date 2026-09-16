# SaveTube - one-click deploy image.
# Contains Node.js + yt-dlp + ffmpeg so real downloads work on the host.
FROM node:20-slim

# Install yt-dlp + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip ffmpeg ca-certificates curl \
    && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
