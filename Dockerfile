FROM node:22-bullseye AS frontend-builder
ARG STRIPE_KEY
ENV VITE_STRIPE_KEY=$STRIPE_KEY
ARG MODE
ENV VITE_MODE=$MODE
ARG APP_VERSION
ENV VITE_APP_VERSION=$APP_VERSION
WORKDIR /app
COPY ./static/package*.json ./
RUN npm install
COPY ./static/src ./src
COPY ./static/index.html ./
COPY ./static/public ./public
COPY ./static/tsconfig.json ./
COPY ./static/tsconfig.app.json ./
COPY ./static/tsconfig.node.json ./
COPY ./static/vite.config.ts ./
RUN npm run build

FROM golang:1.24-bullseye AS backend-builder
# Install wkhtmltox dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    fontconfig \
    libjpeg62-turbo \
    libx11-6 \
    libxcb1 \
    libxext6 \
    libxrender1 \
    xfonts-75dpi \
    xfonts-base \
    pandoc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=frontend-builder /app/dist /app/static/dist

COPY ./go.mod ./go.mod
COPY ./go.sum ./go.sum
RUN go mod download
COPY ./api ./api
COPY ./converters ./converters
COPY ./ctxkeys ./ctxkeys
COPY ./models ./models
COPY ./auth ./auth
COPY ./billing ./billing
COPY ./bin /usr/local/bin/
COPY ./assets ./assets
COPY ./daos ./daos
COPY ./sessions ./sessions
COPY ./cmd ./cmd

ENV PATH="/usr/local/bin:${PATH}"
RUN chmod +x /usr/local/bin/wkhtmltoimage || true \
 && which wkhtmltoimage \
 && wkhtmltoimage -V
 RUN chmod +x /usr/local/bin/wkhtmltopdf || true \
 && which wkhtmltopdf \
 && wkhtmltopdf -V

RUN mkdir -p ./tmp
RUN go build -o ./bin/richdocter ./cmd/richdocter
CMD ["./bin/richdocter"]
