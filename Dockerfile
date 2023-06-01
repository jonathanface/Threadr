FROM golang:1.20.3-alpine

# Install wkhtmltopdf dependencies
RUN apk add --no-cache xvfb libfontconfig libxrender libjpeg-turbo

# Download and install wkhtmltopdf
RUN wget -q -O /tmp/wkhtmltox.tar.xz https://github.com/wkhtmltopdf/wkhtmltopdf/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.alpine3.12.x86_64.tar.xz && \
    tar -xvf /tmp/wkhtmltox.tar.xz -C /tmp && \
    mv /tmp/wkhtmltox/bin/wkhtmltopdf /usr/local/bin/wkhtmltopdf && \
    rm -rf /tmp/wkhtmltox*

WORKDIR /app

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

ENV APP_MODE="PRODUCTION"

COPY ./go.mod ./go.mod
COPY ./go.sum ./go.sum
COPY ./api ./api
COPY ./models ./models
COPY ./auth ./auth
COPY ./daos ./daos
COPY ./sessions ./sessions
COPY ./RichDocter.go ./RichDocter.go
COPY ./static/rd-ui/build/ ./static/rd-ui/build/

RUN apt-get install pandoc

RUN go build -o /RichDocter

CMD ["/RichDocter"]
