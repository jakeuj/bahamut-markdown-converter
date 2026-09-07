# 巴哈姆特 Markdown 轉換器

把 Markdown 轉成可複製的排版內容與巴哈原始碼。免費、免登入，所有文字轉換都在瀏覽器完成。

**[開啟網站](https://blog.jakeuj.com/bahamut-markdown-converter/)**

## 使用方式

1. 貼上 Markdown，或按「載入範例」。輸入後會自動轉換，也可按「立即轉換」或 `Ctrl/Cmd + Enter`。
2. 一般編輯器使用「複製排版」，貼上後檢查格式；若瀏覽器拒絕剪貼簿，依畫面提示選取預覽後手動複製。
3. 若巴哈編輯器有「原始碼」按鈕，可用「複製原始碼」，貼到原始碼模式，再切回排版確認。
4. 需要留存時下載 `.html` 排版或 `.txt` 巴哈原始碼。原始 Markdown 請另外保存；程式碼中的 Tab、空格會轉成視覺縮排，輸出不是逐位元相同的程式碼備份。

## 特色

- 響應式雙欄介面、排版／原始碼分頁、深淺色主題、字元計數。
- 支援標題、粗體、斜體、刪除線、巢狀清單、工作清單、表格、分隔線、連結與圖片。
- 程式碼每行使用 `[div]`，保留空白行；不輸出 `[code]` 或 `[quote]`。
- 特殊字元編碼，HTML 當作文字，LaTeX 保留原文並提醒。
- 不儲存文章、不使用追蹤分析；只記住主題選擇。外部圖片預覽會向圖片網址請求載入。

## 相容性要點

2026-06-04 的站務回覆曾表示關閉原始碼入口；2026-09-07 在本次瀏覽器的完整編輯器中仍可操作。不能推論所有帳號與編輯器都有同樣入口，因此提供雙輸出。

已在巴哈原始碼模式檢查範例的粗體、表格、巢狀清單、連結、程式碼換行與縮排。未送出文章。一般編輯器的富文字貼上仍需人工確認，外部圖片與正式發文結果也未驗證。詳見 [相容性與驗證紀錄](COMPATIBILITY.md)。

巴哈會將標記之間的實體換行轉成額外 `<br>`，因此原始碼採緊湊輸出，以區塊標記表達換行。輸出欄的視覺折行不會改動複製內容。

## 本機開發

需要 Node.js 24 LTS、npm。

```sh
npm ci
npm run dev
```

開啟終端顯示的 `/bahamut-markdown-converter/` 網址。

```sh
npm test
npm run build
npm run preview
```

Vite、TypeScript、原生 HTML/CSS 與 markdown-it；不需要伺服器 API。`tests/paste-target.html` 是開發環境的手動剪貼簿測試區，不包含於正式建置。

## 轉換核心

```ts
import { convertMarkdown } from "./src/converter";
const result = convertMarkdown("# 標題", { tabSize: 4 });
// result.bbcode / result.html / result.plainText / result.warnings
```

先將 Markdown tokens 建成立即使用的結構樹，再分別輸出三種內容。排版預覽與 HTML 剪貼簿共用 `result.html`；只允許產生預設標記，文字與屬性各自編碼，URL 限 HTTP(S)，拒絕含帳密的網址。`tabSize` 可用 1–16 的整數，其他值回到 4。

原始段落中的軟換行也會保留；跨行粗體等格式按行重新包覆。非 1 起始的有序清單改用文字編號。公式支援 `$…$`、`$$…$$`、`\(…\)` 與獨立行的 `\[…\]` 原文保留；不提供 LaTeX 排版。未知語法盡可能保留可讀內容並提醒。

## 部署

GitHub Actions 在 PR 執行測試與建置；`main` 通過後以 Pages artifact 部署 `dist`。儲存庫 Settings → Pages 的 Source 選擇 **GitHub Actions**。

預設路徑為 `/bahamut-markdown-converter/`，未新增專案 CNAME。GitHub Pages 會沿用帳號既有的 `blog.jakeuj.com` 網域，已啟用 HTTPS；`jakeuj.github.io/bahamut-markdown-converter/` 也會轉址到同一網站。若改儲存庫名稱，需要同步調整 `vite.config.ts` 的 `base` 及網站／README 的專案連結。

## 來源與授權

- 使用者提供的 `bahamut-post` 技能：段落、清單、表格、跳脫與程式碼逐行規則，已整理於 [RULES.md](RULES.md)。網站是格式轉換器，不自動改寫或重組文章。
- [Will 保哥的 Discord Markdown 轉換器](https://discord-markdown-converter.gh.miniasp.com/)：參考資訊架構與操作功能；本專案重新實作介面、轉換核心及 CSS 圖形，未複製原站圖像。
- [巴哈站務回覆](https://forum.gamer.com.tw/Co.php?bsn=60404&sn=105975)、[阿冷 Arlen 的 BBCode 工具](https://www.arlenfuture.com/tools/markdown-to-bbcode/)。
- [markdown-it](https://github.com/markdown-it/markdown-it)、[Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write)、[GitHub Pages 自訂工作流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

MIT © 2026 jakeuj。非巴哈姆特官方工具，巴哈姆特名稱屬其權利人。
