FROM node:19-bullseye AS frontend-builder
ARG REACT_APP_STRIPE_KEY
WORKDIR /app
COPY ./static/rd-ui/package*.json ./
RUN npm install
COPY ./static/rd-ui/src ./src
COPY ./static/rd-ui/public ./public
COPY ./static/rd-ui/tsconfig.json ./
COPY ./static/rd-ui/webpack.config.js ./
RUN npm run build

FROM golang:1.21.2 AS backend-builder
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

# Set environment variables for Go
ENV GO111MODULE=auto \
    GOPATH=/go \
    PATH=$GOPATH/bin:/usr/local/go/bin:/usr/local/bin:/usr/local/:$PATH

ENV APP_MODE="PRODUCTION"
ENV PORT=":80"

ARG AWS_ACCESS_KEY_ID
ENV AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY
ENV AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
ARG AWS_REGION
ENV AWS_REGION=$AWS_REGION
ARG AWS_MAX_RETRIES
ENV AWS_MAX_RETRIES=$AWS_MAX_RETRIES
ARG AWS_BLOCKTABLE_MIN_WRITE_CAPACITY
ENV AWS_BLOCKTABLE_MIN_WRITE_CAPACITY=$AWS_BLOCKTABLE_MIN_WRITE_CAPACITY
ARG GOOGLE_OAUTH_CLIENT_ID
ENV GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_OAUTH_CLIENT_ID
ARG GOOGLE_OAUTH_CLIENT_SECRET
ENV GOOGLE_OAUTH_CLIENT_SECRET=$GOOGLE_OAUTH_CLIENT_SECRET
ARG GOOGLE_OAUTH_REDIRECT_URL
ENV GOOGLE_OAUTH_REDIRECT_URL=$GOOGLE_OAUTH_REDIRECT_URL
ARG AMAZON_OAUTH_CLIENT_ID
ENV AMAZON_OAUTH_CLIENT_ID=$AMAZON_OAUTH_CLIENT_ID
ARG AMAZON_OAUTH_CLIENT_SECRET
ENV AMAZON_OAUTH_CLIENT_SECRET=$AMAZON_OAUTH_CLIENT_SECRET
ARG AMAZON_OAUTH_REDIRECT_URL
ENV AMAZON_OAUTH_REDIRECT_URL=$AMAZON_OAUTH_REDIRECT_URL
ARG MSN_OAUTH_CLIENT_ID
ENV MSN_OAUTH_CLIENT_ID=$MSN_OAUTH_CLIENT_ID
ARG MSN_OAUTH_CLIENT_SECRET
ENV MSN_OAUTH_CLIENT_SECRET=$MSN_OAUTH_CLIENT_SECRET
ARG MSN_OAUTH_REDIRECT_URL
ENV MSN_OAUTH_REDIRECT_URL=$MSN_OAUTH_REDIRECT_URL
ARG ROOT_URL
ENV ROOT_URL=$ROOT_URL
ARG SESSION_SECRET
ENV SESSION_SECRET=$SESSION_SECRET
ARG VERSION
ENV VERSION = $VERSION
ARG STRIPE_KEY
ENV STRIPE_KEY=$STRIPE_KEY
ARG STRIPE_SECRET
ENV STRIPE_SECRET=$STRIPE_SECRET
ARG OPENAI_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY

COPY --from=frontend-builder /app/dist /app/static/rd-ui/dist

COPY ./go.mod ./go.mod
COPY ./go.sum ./go.sum
COPY ./api ./api
COPY ./converters ./converters
COPY ./models ./models
COPY ./auth ./auth
COPY ./billing ./billing
COPY ./bins /usr/local/bin/
COPY ./daos ./daos
COPY ./sessions ./sessions
COPY ./RichDocter.go ./RichDocter.go

RUN go mod tidy

RUN mkdir -p ./tmp
RUN go build -o /RichDocter
#CMD ["sleep", "infinity"]
CMD ["/RichDocter"]

