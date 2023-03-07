FROM golang:1.18-alpine
#RUN apk add --no-cache bash
WORKDIR /app
ARG AWS_ACCESS_KEY_ID
ENV AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
RUN echo "MY_SECRET: $AWS_ACCESS_KEY_ID"


COPY ./go.mod ./go.mod
COPY ./go.sum ./go.sum
COPY ./api ./api
COPY ./auth ./auth
COPY ./sessions ./sessions
COPY ./RichDocter.go ./RichDocter.go
RUN go build -o /RichDocter

EXPOSE 8080

CMD ["/RichDocter"]
