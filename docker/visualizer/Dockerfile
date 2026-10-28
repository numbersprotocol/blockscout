# 保留正式 v0.2.1 binary 及 sol2uml 2.1.9 的完整依賴，不重新解析 npm 版本。
FROM ghcr.io/blockscout/visualizer@sha256:ffce88a765b0466824175cc8fed6e6b31d682310a96933b98451aefdfffecdc7 AS upstream

FROM node:22.23.4-bookworm-slim
WORKDIR /usr/src/

# 沿用上游 runtime 所需的 Chromium；不複製舊 Node 或 Debian 11 套件。
RUN apt-get update && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*

COPY --from=upstream /usr/src/visualizer-server ./visualizer-server
COPY --from=upstream /usr/local/lib/node_modules/sol2uml /usr/local/lib/node_modules/sol2uml
RUN ln -s ../lib/node_modules/sol2uml/lib/sol2uml.js /usr/local/bin/sol2uml \
    && test "$(node --version)" = v22.23.4 \
    && test "$(sol2uml --version)" = 2.1.9 \
    && test -z "$(find /usr/local/lib/node_modules/sol2uml -name '*.node' -print -quit)"

ENTRYPOINT ["./visualizer-server"]
