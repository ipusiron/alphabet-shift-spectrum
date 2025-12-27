<!--
---
id: day107
slug: alphabet-shift-spectrum

title: "Alphabet Shift Spectrum"

subtitle_ja: "26シフト頻度可視化ツール"
subtitle_en: "26-Shift Frequency Visualization Tool"

description_ja: "Caesar暗号・単一換字暗号の解析を支援するツール。26シフトすべての文字頻度を可視化し、低頻度文字（J,K,Q,X,Z）の統計的フィルタリングで候補を絞り込む。"
description_en: "A tool to assist in analyzing Caesar cipher and monoalphabetic shift ciphers. Visualizes letter frequency for all 26 shifts and narrows candidates through statistical filtering of low-frequency letters (J, K, Q, X, Z)."

category_ja:
  - 暗号解析
  - 古典暗号
category_en:
  - Cryptanalysis
  - Classical Cryptography

difficulty: 3

tags:
  - Caesar cipher
  - frequency analysis
  - cryptanalysis
  - vanilla JavaScript
  - responsive design

repo_url: "https://github.com/ipusiron/alphabet-shift-spectrum"
demo_url: "https://ipusiron.github.io/alphabet-shift-spectrum/"

hub: true
---
-->

# Alphabet Shift Spectrum – 26シフト頻度可視化ツール

![GitHub Repo stars](https://img.shields.io/github/stars/ipusiron/alphabet-shift-spectrum?style=social)
![GitHub forks](https://img.shields.io/github/forks/ipusiron/alphabet-shift-spectrum?style=social)
![GitHub last commit](https://img.shields.io/github/last-commit/ipusiron/alphabet-shift-spectrum)
![GitHub license](https://img.shields.io/github/license/ipusiron/alphabet-shift-spectrum)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue?logo=github)](https://ipusiron.github.io/alphabet-shift-spectrum/)

**Day107 - 生成AIで作るセキュリティツール200**

**Alphabet Shift Spectrum** は、Caesar暗号や単一換字暗号の解析を支援するWebツールです。

入力されたテキストに対して0〜25の全シフトを適用し、各シフトごとの文字頻度を可視化します。
さらに、低頻度文字（J, K, Q, X, Z）の統計的分析により、候補となるシフト量を絞り込みます。

---

## 🌐 デモページ

👉 **[https://ipusiron.github.io/alphabet-shift-spectrum/](https://ipusiron.github.io/alphabet-shift-spectrum/)**

ブラウザーで直接お試しいただけます。

---

## 📸 スクリーンショット

以下は実際の画面例です。

>![シフト一覧を生成](assets/screenshot.png)
>
> *シフト一覧を生成*

>![頻度ヒートマップ](assets/screenshot1.png)
>
> *頻度ヒートマップ*

>![低頻度文字分析 (J, K, Q, X, Z)](assets/screenshot2.png)
>
> *低頻度文字分析 (J, K, Q, X, Z)*

---

## ✨ 機能一覧

### シフト一覧（Tab1）
- 26シフト（0〜25）の結果をカード形式で一覧表示
- 各カードにシフト後テキストとA-Z出現回数テーブルを表示
- 低頻度文字（J, K, Q, X, Z）をハイライト表示
- 候補シフト（緑ボーダー）と除外シフト（赤ボーダー・半透明）を視覚的に区別

### 分析・フィルター（Tab2）
- **頻度ヒートマップ**: 26行×26列のグリッドで全シフトの文字頻度を可視化
  - セルホバー時に行・列・セルをハイライト
  - ツールチップで詳細情報を表示
- **低頻度文字分析**: 統計的手法による候補絞り込み
  - 除外閾値の自動計算（二項分布の3σルール）
  - 計算式の可視化と解説モーダル
- **フィルター結果**: 候補シフトと除外シフトを分類表示

---

## 📖 使い方

1. **暗号文を入力**: テキストエリアに解読したい暗号文を入力します（英字のみ有効）
2. **シフト生成をクリック**: 26パターンすべてのシフト結果が生成されます
3. **シフト一覧を確認**: Tab1で各シフトの復号結果と文字頻度を確認
4. **分析・フィルターで絞り込み**: Tab2のヒートマップと低頻度文字分析で候補を絞り込み

---

## 📐 画面構成

| タブ | 内容 |
|------|------|
| シフト一覧 | 26シフトの結果カード表示 |
| 分析・フィルター | ヒートマップと低頻度文字分析 |
| Tab3 (準備中) | 将来機能追加予定 |
| Tab4 (準備中) | 将来機能追加予定 |

---

## 🔬 技術的な説明

### 除外閾値の計算

```
除外閾値 = ⌈n × p + 3 × √(n × p)⌉
```

- **n**: 入力テキストの文字数
- **p**: 低頻度文字の期待頻度（0.00772）
- **3σルール**: 二項分布の正規近似に基づき、期待値から3標準偏差以上離れた値を異常と判定

### 判定ロジック

各シフトについてJ, K, Q, X, Zの最大出現回数を求め、それが除外閾値以上であれば候補から除外します。
これにより、統計的に不自然なシフトを自動的にフィルタリングできます。

---

## 🎯 本ツールの活用例

### ゲーム「Cypher」での暗号解読

- [POLYALPHABETIC SUBSTITUTION PUZZLE 03【Cypher編】](https://akademeia.info/?p=36264)

---

## 📁 ディレクトリー構造

```
alphabet-shift-spectrum/
├── index.html          # メインHTML（SPA）
├── script.js           # アプリケーションロジック
├── style.css           # ベースCSS・共通スタイル
├── style-mobile.css    # モバイル用スタイル
├── style-tablet.css    # タブレット用スタイル (600px+)
├── style-laptop.css    # PC用スタイル (900px+)
├── docs/
│   ├── DETAIL_DESIGN.md  # 詳細設計書
│   └── SCREEN_SPEC.md    # 画面仕様書
├── assets/
│   ├── screenshot.png    # シフト一覧スクリーンショット
│   ├── screenshot1.png   # 頻度ヒートマップ
│   └── screenshot2.png   # 低頻度文字分析
├── README.md           # 本ドキュメント
├── CLAUDE.md           # Claude Code用プロジェクト概要
└── LICENSE             # ライセンスファイル
```

---

## 💻 動作環境

- モダンブラウザー（Chrome, Firefox, Safari, Edge）
- JavaScript有効
- レスポンシブ対応（モバイル〜PC）

---

## 📄 ライセンス

- ソースコードのライセンスは `LICENSE` ファイルを参照してください（MIT License）。

---

## 🛠️ このツールについて

本ツールは、「生成AIで作るセキュリティツール200」プロジェクトの一環として開発されました。
このプロジェクトでは、AIの支援を活用しながら、セキュリティに関連するさまざまなツールを100日間にわたり制作・公開していく取り組みを行っています。

プロジェクトの詳細や他のツールについては、以下のページをご覧ください。

🔗 [https://akademeia.info/?page_id=44607](https://akademeia.info/?page_id=44607)
