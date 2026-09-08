# 巴哈編輯器與文章預覽證據

日期：2026-09-08。整理自使用者更新的 bahamut-post 技能之延伸語法實測，以及本輪轉換器驗證；保留來源與流程，避免維護時依賴個人家目錄。這些是桌面／手機**網頁文章預覽**，不是原生 App 或正式發文。正式貼文證據另見 [COMPATIBILITY.md](../COMPATIBILITY.md)。

## 既有延伸語法實測

流程：在[回覆編輯器](https://forum.gamer.com.tw/post1.php?bsn=60076&type=2&snA=9214418&prevPageSubbsn=0)填入原始碼，切換富文字編輯區，再點上方「預覽」，分別讀取 editor、desktopPreview、mobilePreview iframe。未發布。下列數字是當次結果，非固定平台規格。

| 項目                                               | 電腦文章預覽           | 手機文章預覽         | 維護含義                                          |
| -------------------------------------------------- | ---------------------- | -------------------- | ------------------------------------------------- |
| div align left/center/right、td align center/right | 有效                   | 有效                 | 可保留 Markdown 對齊；本輪另目視驗證 td 三種對齊  |
| div width=120 height=60                            | 屬性保留但尺寸無效     | 同左                 | 不依此控制布局；編輯區有效不代表文章有效          |
| table width=100%                                   | 測得 688px             | 約 445px，容器 376px | 100% 不保證內容不溢出                             |
| rowspan=2、colspan=2、td bgcolor                   | 有效                   | 有效                 | 有預覽證據；未因此加入 Markdown 合併儲存格擴充    |
| td valign top/middle/bottom                        | 各值有效               | 均為 middle          | 必須查有效樣式                                    |
| h1/h2/h3                                           | 30/30/22px             | 32/32/24px           | 粗體標題是工具選擇；h1/h2 未形成不同大小          |
| 巢狀 tab                                           | 每層 padding-left 12px | margin/padding 為 0  | 不替代 quote 或跨裝置清單縮排                     |
| table width=30% align=center                       | 窄表格置中             | 撐滿容器             | 不保證比例寬度／置中一致                          |
| img width=30 height=50                             | 30×50px                | 約 30×20.57px        | 手機按原始比例呈現，屬性保留不等於指定高度有效    |
| HTTPS YouTube movie                                | 播放器載入             | 播放器載入           | 來源為私人影片，未通過實際播放驗證；不可降級 HTTP |

顏色、背景色、size 1–7、中文 font-family、U/u、em=43 也有預覽證據；字體宣告保留不代表裝置有對應字體，單一表情編號不代表現行上限。

歷史資料僅作候選來源，不能覆蓋新實測：

- [Aishimeth：巴哈文章 — 原始碼的標籤及屬性](https://home.gamer.com.tw/artwork.php?sn=3757155)
- [Hydra葵：巴哈發文原始碼語法整理](https://home.gamer.com.tw/artwork.php?sn=3067679)
- [雙雙：巴哈姆特原始碼 BBCode 整理](https://home.gamer.com.tw/artwork.php?sn=3374992)

## 本輪整合輸出驗證

使用者原有回覆編輯器確認為 `[div]\n[/div]` 空白內容後，填入新版轉換器實際生成的緊湊原始碼：兩層引用、3×3 左中右對齊表格（含空白格）、3/4 文字編號及 code／空白行／end。

- 編輯區及文章預覽的可及性快照保留表格列、儲存格、兩層引用和所有文字。
- 電腦與手機文章預覽截圖均可見表頭與資料左／中／右對齊，空白格保留，編號與 code 空白行正常。
- 本輪 locator evaluate 持續逾時，未取得 computed style 與精確尺寸；不得將這次目視結果寫成 DOM 尺寸量測通過。
- 完成後關閉預覽並還原空白原始碼，保留使用者編輯器分頁。沒有發布、備份、修改既有貼文或寄信。
- 本輪富文字貼到巴哈後的結果尚未驗證；本機雙 clipboard payload 測試不能代替人工貼上。
