# Base image with Go and wkhtmltox dependencies
FROM golang:1.21.2

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
ENV REACT_APP_STRIPE_KEY=$STRIPE_KEY


ENV APP_MODE="PRODUCTION"

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
COPY ./static/rd-ui/build/ ./static/rd-ui/build/

RUN mkdir -p ./tmp
RUN go build -o /RichDocter

CMD ["/RichDocter"]
