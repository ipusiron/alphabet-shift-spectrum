# Alphabet Shift Spectrum - 詳細設計書

## 概要
Alphabet Shift Spectrum は、入力されたテキストに対して 0〜25 の全アルファベットシフトを適用し、
各シフトごとの文字頻度を可視化・分析する教育・解析向けツールである。
本ツールは「鍵を決定する」のではなく、「判断材料を提示する」ことを目的とする。

## 対象暗号
- シーザー暗号
- 単一鍵ヴィジュネル暗号（鍵長1）
- その他 monoalphabetic shift 系暗号

## 技術スタック
- Vanilla HTML/CSS/JavaScript（フレームワーク不使用）
- モバイルファーストCSS（ブレイクポイント: 600px, 900px）
- SPA構成

## 画面構成

### 共通エリア（タブ外）
- ヘッダー（タイトル・サブタイトル）
- タブナビゲーション
- 入力セクション（暗号文入力・シフト生成ボタン）
- フッター（GitHubリポジトリリンク）

### Tab1: シフト一覧
- 26シフト分のカード表示
- 各カードに候補/除外ステータス表示
- シフト後テキストプレビュー
- A-Z出現回数テーブル（低頻度文字 J,K,Q,X,Z をハイライト）

### Tab2: 分析・フィルター
- 頻度ヒートマップ（26行×26列、ホバーで行列ハイライト）
- 低頻度文字分析セクション
  - 除外閾値の計算（文字数・期待頻度・除外閾値）
  - 計算式表示と解説モーダル
  - フィルター結果（候補シフト・除外シフト）

### Tab3 / Tab4
- 将来機能追加予定（無効化状態）

## データ構造

### アプリケーション状態
```js
appState = {
  inputText: '',        // 元の入力テキスト
  normalizedText: '',   // 正規化後テキスト（大文字英字のみ）
  rows: [],             // 26シフト分のデータ
  mThreshold: 0,        // 除外閾値
  activeTab: 'tab1'     // 現在のタブ
}
```

### シフト行データ
```js
{
  shift: 0,                    // シフト量 (0-25)
  text: "SHIFTED TEXT...",     // シフト後テキスト
  freq: { A:5, B:2, ..., Z:0 } // A-Z出現回数
}
```

### フィルター結果データ
```js
{
  shift: 0,
  text: "...",
  freq: { ... },
  maxLowFreq: 3,   // J,K,Q,X,Z の最大出現回数
  sumLowFreq: 5    // J,K,Q,X,Z の合計出現回数
}
```

## 処理フロー

### 1. テキスト正規化
- 入力テキストを大文字に変換
- 非英字（数字・記号・空白等）を除去
- 有効文字数をリアルタイム表示

### 2. シフト生成
- 0〜25 の各シフト量でテキストを変換
- 各シフトについて A-Z の出現回数を計算

### 3. 除外閾値計算
```
除外閾値 = ⌈n × p + 3 × √(n × p)⌉
```
- n = 文字数
- p = 0.00772（低頻度文字の期待頻度）
- 二項分布の正規近似に基づく3σルール

### 4. フィルタリング
- 各シフトについて max(J,K,Q,X,Z) を計算
- max ≥ 除外閾値 のシフトを候補から除外
- 結果を候補シフト/除外シフトに分類

## 主要関数

| 関数名 | 説明 |
|--------|------|
| `normalizeText(text)` | テキスト正規化 |
| `applyShift(text, shift)` | シーザーシフト適用 |
| `calculateFrequency(text)` | A-Z出現回数計算 |
| `generateAllShifts(text)` | 26シフト生成 |
| `calculateMThreshold(n)` | 除外閾値計算 |
| `getMaxLowFreqCount(freq)` | J,K,Q,X,Z最大値取得 |
| `getSumLowFreqCount(freq)` | J,K,Q,X,Z合計値取得 |
| `filterByMThreshold(rows, threshold)` | 閾値フィルタリング |
| `renderShiftResults(rows)` | シフト結果レンダリング |
| `renderHeatmap(rows)` | ヒートマップレンダリング |
| `renderFilterResults(result)` | フィルター結果レンダリング |

## ファイル構成
```
alphabet-shift-spectrum/
├── index.html          # メインHTML
├── script.js           # アプリケーションロジック
├── style.css           # ベースCSS・共通スタイル
├── style-mobile.css    # モバイル用スタイル
├── style-tablet.css    # タブレット用スタイル (600px+)
├── style-laptop.css    # PC用スタイル (900px+)
├── docs/
│   ├── DETAIL_DESIGN.md
│   └── SCREEN_SPEC.md
├── README.md
├── CLAUDE.md
└── LICENSE
```
