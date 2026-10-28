# Visualizer Node.js 更新

此映像只更新 Node 執行環境至 `22.23.4-bookworm-slim`。使用官方
visualizer v0.2.1 的固定 digest，直接保留其 Rust binary、sol2uml 2.1.9
與完整依賴，不重新解析 npm 版本，也不重新編譯 Rust。Chromium 由新基底的
Debian bookworm 套件庫安裝，入口、工作目錄與 HTTP/gRPC 設定沿用上游。

官方來源：

- [v0.2.1 原始碼](https://github.com/blockscout/blockscout-rs/tree/acf11c8757f5c4cba1caddcfe6ea0ee7914f30ff/visualizer)
- [v0.2.1 HTTP schema](https://github.com/blockscout/blockscout-rs/blob/acf11c8757f5c4cba1caddcfe6ea0ee7914f30ff/visualizer/visualizer-proto/proto/api_config_http.yaml)

2026-10-28 核對官方 registry：`latest` 與 `v0.2.1` 的 digest 均為
`sha256:ffce88a765b0466824175cc8fed6e6b31d682310a96933b98451aefdfffecdc7`，
Node 為 16.20.2；`main` 為 22.23.2，仍低於此次安全門檻且已變更 sol2uml。
因此本次不直接更新至 `main` 或其他 microservices。

## 建置與測試

從 repository 根目錄執行：

```sh
docker build --pull -f docker/visualizer/Dockerfile \
  -t blockscout-visualizer:node22.23.4-v0.2.1 .
docker run --rm --entrypoint node blockscout-visualizer:node22.23.4-v0.2.1 --version
docker run --rm --entrypoint sol2uml blockscout-visualizer:node22.23.4-v0.2.1 --version
```

`visualizer-runtime.yml` 在同一 runner 以相同測試比較原映像與候選的
UML、storage、import、巢狀路徑、SVG output mask、找不到合約及語法錯誤。
成功回應必須為 HTTP 200／有效 SVG，並逐筆比對 SVG SHA256；錯誤回應也需相同。
只有錯誤訊息中的隨機 tempfile 目錄會正規化。CI 同時核對 binary 與所有
sol2uml 檔案／symlink 相同，保存已測試的候選 image 與 checksum。

```sh
python3 docker/visualizer/smoke.py --url http://127.0.0.1:18050 --output baseline.json
python3 docker/visualizer/smoke.py --url http://127.0.0.1:18051 \
  --output candidate.json --baseline baseline.json
```

API 使用 `/api/v1/solidity:visualize-contracts` 與
`/api/v1/solidity:visualize-storage`；`/health` 回傳 `SERVING`。
此舊版服務只產生 SVG，未實作 PNG；不把 PNG 輸出列為已測功能。

## Compose 與正式單服務更新

`docker-compose/services/visualizer.yml` 預設使用本地安全映像與上述 Dockerfile。
`VISUALIZER_IMAGE` 可指定已驗證的完整 image reference；原本
`VISUALIZER_DOCKER_TAG` 不再使用。保留 `linux/amd64`、restart policy、env file
與服務名稱，不發布新的 host port。

正式主機有本機修改，不能直接 `git pull` 或重建整套 explorer。
review 與 CI 通過後，先下載候選 artifact、核對 checksum、載入 image；
在隔離的 localhost port 以低資源限制執行相同測試。部署前保存原 image ID、
compose、visualizer env file，以及其餘服務的 ID／image／StartedAt。
回復期間保留原 image，不修改 volume 或執行 migration。

使用正式既有 compose 及只設定 visualizer 的 override，完整固定已驗證 image，
並設 `pull_policy: never`；override 路徑及 image ID 記錄在部署紀錄。

```yaml
services:
  visualizer:
    image: blockscout-visualizer:REVIEWED_COMMIT
    pull_policy: never
```

以下 `PROJECT`／`BASE_COMPOSE`／`OVERRIDE` 必須由該次正式容器標籤及快照核對，
不可直接套用範例名稱：

```sh
docker compose -p "$PROJECT" -f "$BASE_COMPOSE" -f "$OVERRIDE" \
  up -d --no-deps --no-build visualizer
```

部署後檢查 Node／sol2uml、health、UML／storage、公開 explorer UML 與首頁／供應量／索引。
若失敗，以相同指令改用保存原 image ID 的 rollback override，僅回復 visualizer。
其餘服務需比對沒有被替換。既有 proxy 的獨立 Node22 override 仍須保留。
最後由獨立 QA 於正式站檢查桌面／手機與 API。
