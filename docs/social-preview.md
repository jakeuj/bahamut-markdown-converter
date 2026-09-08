# 社群分享預覽

首頁在初始 HTML 提供 canonical、Open Graph 與 Twitter Card metadata；不依賴 JavaScript 產生。這些分享設定與 Google 自行選取的搜尋摘要分開處理。

- 分享封面：`public/social-preview-v1.png`，1200 × 630 PNG。
- 可編輯來源：`docs/assets/social-preview.svg`，使用 PingFang TC；重新輸出時確認繁體中文沒有缺字。可用支援 SVG 與系統中文字型的工具（例如 sharp）轉為同尺寸 PNG，不要放大 favicon。
- 改版時更新圖片版本檔名與 `index.html` 的 `og:image`／`twitter:image`；維持正式站 HTTPS 絕對網址、尺寸、MIME type 與 alt 一致。
- `npm run build` 後確認封面複製到 `dist`，初始 `dist/index.html` 保留 metadata。
- 部署後確認首頁及圖片 HTTP 200、圖片 Content-Type 正確，再以 Facebook Sharing Debugger 檢查抓取結果。平台可能保留先前抓取資料；本機建置成功不等於既有貼文卡片已更新。

2026-09-08：本機已檢查封面尺寸、中文字與 metadata，尚未完成本次部署及 Facebook 抓取驗證。

規格：[Open Graph](https://ogp.me/)。
