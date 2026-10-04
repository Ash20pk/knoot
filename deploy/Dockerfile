# The relay, for teams that host their own.
#
# Built in CI from the same static musl binary the release ships, so the image
# is that binary and an empty data directory — no shell, no package manager,
# nothing to patch. TLS is not its job: put it behind a proxy (see the README,
# "Self-hosting the relay"). The binary carries its own root certificates for
# the one outbound call it can make, Neon's published keys.
#
#   docker run -d -p 127.0.0.1:7420:7420 -v knoot:/data \
#     -e KNOOT_RELAY_TOKEN="$(openssl rand -hex 24)" ghcr.io/ash20pk/knoot
FROM alpine:3.20 AS data
RUN mkdir /data && chown 65532:65532 /data

FROM scratch
COPY --chmod=0755 knoot-x86_64-linux /knoot
# Owned by the user the relay runs as, so a fresh named volume mounted here
# starts out writable.
COPY --from=data --chown=65532:65532 /data /data
USER 65532:65532
ENV HOME=/data
VOLUME /data
EXPOSE 7420
ENTRYPOINT ["/knoot"]
CMD ["relay", "--listen", "0.0.0.0:7420", "--db", "/data/relay.db"]
