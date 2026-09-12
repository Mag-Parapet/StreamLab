FROM rust:1.94-bookworm AS build
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY migrations ./migrations
COPY src ./src
RUN cargo build --locked --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home signal
COPY --from=build /build/target/release/stream-control /usr/local/bin/stream-control
USER 10001:10001
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/stream-control"]
