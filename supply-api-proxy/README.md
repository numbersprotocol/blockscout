# NUM 供應量 proxy

程式、依賴鎖檔、唯讀 Google 憑證掛載及 localhost 綁定，同步自 2026-10-27 正式環境既有 v2。`server.js` 保留正式版本原文；本次 runtime 更新使用官方 `node:22.23.4-bookworm-slim`，依現有 lockfile 安裝，不更新依賴版本。

憑證只放在部署主機的 `credentials/sa.json`，不要提交 Git 或放進 image。容器以 `node` 使用者執行，服務只綁定 `127.0.0.1:3000`，由既有 nginx 提供公開端點。

## 驗證

```sh
npm ci --prefix supply-api-proxy --no-audit --no-fund
npm test --prefix supply-api-proxy
docker build -t supply-api-proxy:node22 supply-api-proxy
docker run --rm supply-api-proxy:node22 node --version
docker run --rm supply-api-proxy:node22 id -u
docker run --rm --mount "type=bind,source=$PWD/supply-api-proxy/test,target=/app/test,readonly" supply-api-proxy:node22 npm test
```

HTTP 測試在獨立子程序模擬 GoogleAuth/Sheets，驗證 scope、請求格式、快取、503 與恢復行為；不修改正式程式，也不取代部署前使用既有唯讀憑證的真實 Sheets 驗證。測試與憑證都排除於 Docker build context。

PR 的 `Supply proxy Node runtime` workflow 使用指定 Node 版本，建立並測試 exact head 的 image，將 image tar、checksum 與 inspect 結果存成七天有效的 artifact。部署使用同一個已驗證產物。

## 部署與回復

先核對正式程式雜湊及本機修改，保存 compose、原始碼與原 image ID，保留舊 image。候選 image 載入後，先用既有唯讀憑證、隔離 port 與資源限制驗證真實供應量。只有獨立 review 與 exact-head CI 通過才可替換正式服務。

在既有 compose 上以暫存 override 指定已驗證的 candidate image，執行 `docker compose -f docker-compose.yml -f <override> up -d --no-deps --no-build proxy`。不覆蓋其他正式本機修改，不執行 `compose down`、migration 或資料卷操作。

若健康、供應量或 explorer smoke 失敗，以相同 override 改回保存的原 image ID，對單一 `proxy` service 執行相同指令，並重新驗證公開 `/supply`。完整 artifact、SHA 與實際命令記錄於部署紀錄。
