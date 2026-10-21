# 展覽助教排班系統

助教用名字進入、點選自己有空的時段；老師在後台看每個時段誰有空，一鍵匯出 Excel 班表，之後的調班、請假都直接在 Excel 上改。

- **助教填寫頁**：`https://<專案ID>.web.app/e/<檔期ID>`（後台的「複製填寫連結」）
- **管理後台**：`https://<專案ID>.web.app/admin`（Google 登入）

全部跑在 Firebase 免費方案（Spark）內：Hosting + Firestore + Authentication，沒有用 Cloud Functions，不需要綁信用卡。

---

## 老師的日常操作

1. 到 `/admin` 用 Google 帳號登入。
2. 按「新增檔期」，填名稱、起訖日期、每週哪幾天。時段預設帶入 12:00–18:00 的六個時段。
3. 在「設定」分頁點掉放假的日子、調整時段。
4. 按「複製填寫連結」，貼到助教群組。
5. 「總覽」分頁會即時顯示每格有幾個人有空，點一格可以看是誰。
6. 大家填完後，關掉「開放填寫」，助教就只能查看、不能再改。
7. 按「匯出 Excel」。旁邊的「含自動排班草稿」預設勾選，班表會先填好一版草稿；取消勾選就匯出空白班表。

### Excel 裡有什麼

| 工作表 | 內容 |
|---|---|
| 班表 | 和原本的格式一樣（列是時段、欄是日期）。點格子會出現下拉選單，只列出那格有空的人，也可以直接打字。還沒排的格子是**黃色**，沒人有空的格子先填「—」。勾選「含自動排班草稿」時，格子會先填好系統排的名字，一樣可以用下拉選單換人。 |
| 有空名單 | 每格有誰有空，顏色越深人越多。 |
| 統計 | 每個人「已排時數」用公式即時計算，改了班表會自動更新；一格寫兩個名字也會分別算。另外列出每個人在系統裡填的有空時數。 |

**時數怎麼算**：每個時段一律算 **1 小時**，不看實際分鐘數（12:00–13:10 是 1 小時、17:20–18:00 也是 1 小時）。所以時數就等於格數，助教頁、後台總覽、填寫名單、Excel 統計和自動排班都用同一個標準。

**自動排班草稿怎麼排**（[`src/lib/autoschedule.ts`](src/lib/autoschedule.ts)）：每格排 1 人，依下面的優先順序：

1. **填滿**：只要有人有空的格子一定會排人；沒人有空的格子留「—」。
2. **連續**：同一個人同一天的班盡量排成連續一段，避免中間空一段又回來。
3. **平均**：依時數平均分配（每個時段算 1 小時）。

連續和平均衝突時以連續為主：兩人時數差 3～4 小時以內，寧可讓班連續；差更多才拆開來平均。有些格子只有一個人有空，那個人就一定會被排到，所以時數不一定能完全平均，班也可能是零碎的一格。草稿只是起點，排完請在 Excel 上看「統計」再調整。

### 助教打錯名字、重複填

「填寫名單」分頁可以**改名或合併**（例如把「陳曉華」合併到「陳小華」，兩邊的時段會合在一起），也可以刪除。

---

## 架設（第一次，由學生完成）

需要：Node.js 20 以上。本機測試還需要 Java 21（Firebase Emulator 用）。

### 1. 建立 Firebase 專案

1. 到 [Firebase Console](https://console.firebase.google.com/) 建立專案，不用開 Google Analytics。
2. **Firestore Database** → 建立資料庫 → 位置選 `asia-east1`（台灣）→ 「正式版模式」。
3. **Authentication** → 開始使用 → 登入方式 → 啟用 **Google**。
4. **Hosting** → 開始使用（直接按完精靈就好，部署用下面的指令）。

### 2. 部署

```bash
npm install
npx firebase login
npx firebase use --add
```

`use --add` 選剛建立的專案，別名輸入 `default`。之後每次更新都只要：

```bash
npm run deploy
```

這會 build 網站，並部署 Hosting 和 Firestore security rules。網站的 Firebase 設定是 Hosting 自動提供的（`/__/firebase/init.json`），程式碼裡沒有寫死專案 ID。

### 3. 新增管理者

管理者名單**只能從 Firebase Console 修改**（網頁上改不了，避免有人把別人踢掉）：

Firestore Database → 新增集合 `admins` → 文件 ID 填管理者的 **Google 帳號 email**（例如 `teacher@gmail.com`）→ 欄位留空，直接儲存。

每個要能進後台的人都新增一份。要移除就刪掉那份文件。

---

## 移交給老師

為了避免「建置的人離開後系統就沒了」，整個 Firebase 專案要由老師擁有：

1. Firebase Console → 專案設定（齒輪）→ **使用者和權限** → 新增成員 → 輸入老師的 Google 帳號，角色選 **擁有者（Owner）**。
2. 老師會收到 email 邀請，接受後就是擁有者。
3. 確認老師可以登入 Console 之後，把自己改成「編輯者」或直接移除。
4. 在 Firestore 的 `admins` 集合新增老師的 email（見上方）。
5. 這份程式碼也放到老師（或系上）的 GitHub 帳號下，或至少給老師一份完整的壓縮檔。

> 已部署的網站和資料存在 Firebase 上，跟程式碼放在哪裡無關。就算程式碼不見，網站也會照常運作；只是之後要修改功能時會需要程式碼。

### 備份

Spark 免費方案沒有自動備份。每次檔期結束後「匯出 Excel」就是備份。

---

## 權限設計

助教**不用登入**，輸入名字就能填，像 When2meet 一樣。代價是系統分辨不出誰是誰：知道連結、又知道某人名字的人，技術上可以改那個人的時段。用下面幾條限制把風險壓低：

- 每個檔期的連結 ID 是隨機的，外人猜不到。
- 助教只能讀寫「指定名字」的那一份，**不能列出其他人**，也**不能刪除**。
- 管理者關閉「開放填寫」後，任何人都不能再修改。
- 管理者用 Google 登入，名單只能從 Console 改。

規則全部寫在 [`firestore.rules`](firestore.rules)。

### 資料結構

```
admins/{email}                        管理者名單（空文件）
events/{檔期ID}                       title, dates[], slots[{start,end}], isOpen, createdAt
events/{檔期ID}/availability/{名字}   slots[]（例如 "2026-10-13_12:00"）, updatedAt
```

時段的識別用「日期_開始時間」，所以管理者增刪時段時，其他時段的資料不會錯位；改了某個時段的開始時間，那個時段原本填的資料就不會顯示（資料還在，改回來就會恢復）。

---

## 本機開發

不會碰到正式資料，全部跑在 Firebase Emulator 上。

```bash
npm run emulators
```

另開一個終端機：

```bash
npm run seed
```

```bash
npm run dev
```

- 助教頁：http://localhost:5173/e/demo
- 後台：http://localhost:5173/admin（登入視窗選「Add new account」，email 填 `admin@example.com`）
- Emulator 資料檢視：http://localhost:4000

### 程式碼結構

```
src/
  main.tsx              網址對應的頁面
  firebase.ts           Firebase 初始化（開發時連 Emulator）
  lib/schedule.ts       日期、時段、時數的計算（每個時段算 1 小時）
  lib/api.ts            所有 Firestore 讀寫
  lib/excel.ts          匯出 Excel
  lib/autoschedule.ts   自動排班草稿
  ta/                   助教填寫頁（格子拖曳選取、自動儲存）
  admin/                管理後台（檔期清單、熱度圖、名單、設定）
  styles/tokens.css     設計 token（顏色、圓角、明暗模式）
firestore.rules         security rules
scripts/seed-dev.mjs    本機測試資料
```

技術：Vite + React + TypeScript，Firebase JS SDK，ExcelJS，Lucide 圖示。介面依照 Neutral Tool UI 設計規範。
