[README.md](https://github.com/user-attachments/files/34317663/README.md)
# 慢滴手沖：手沖咖啡新手教學網站

一個純靜態的互動教學網站（HTML、CSS、JavaScript，沒有框架、不需要建置）。

## 網站怎麼用

1. 備好器材：勾選清單，必備六項都有就可以往下。
2. 算出用量：選杯數、口感、烘焙度，得到咖啡粉克數、水量和水溫。
3. 跟著沖：按「開始計時」，濾杯動畫會跟著水量變化，換步驟時會響一聲。
4. 調整味道：太酸、太苦時，點一下就看到下一杯的改法。

## 檔案

- `index.html`：頁面內容
- `style.css`：樣式
- `script.js`：計算機、計時器、濾杯動畫、味道調整

## 本機預覽

直接用瀏覽器開啟 `index.html`，或在這個資料夾執行：

```bash
python3 -m http.server 8000
```

然後開啟 http://localhost:8000。

## 上傳到 GitHub

1. 到 GitHub 建立一個新的 repository（例如 `coffee-guide`），不要勾選 README。
2. 在這個資料夾執行：

```bash
git init
git add .
git commit -m "第一版手沖咖啡教學網站"
git branch -M main
git remote add origin https://github.com/你的帳號/coffee-guide.git
git push -u origin main
```

3. repository 的網址（`https://github.com/你的帳號/coffee-guide`）就是要交的 GitHub 連結。

## 部署到 Cloudflare Pages

1. 登入 Cloudflare 控制台，進入 Workers & Pages，選擇建立 Pages 專案並連接 Git。
2. 授權 GitHub，選擇剛剛的 `coffee-guide` repository。
3. 設定：
   - Framework preset：None
   - Build command：留空
   - Build output directory：`/`（留空或填 `/` 皆可）
4. 按 Save and Deploy，完成後會得到 `https://專案名稱.pages.dev`，這就是要交的 Cloudflare 網址。

之後只要 `git push`，Cloudflare 會自動重新部署。

（Cloudflare 的介面名稱偶爾會調整，找不到時請以畫面上的 Pages、Connect to Git 為準。）
