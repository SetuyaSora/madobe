# Privacy Policy / プライバシーポリシー

**窓辺 (Madobe)**（以下、「本拡張機能」）は、ユーザーのプライバシーを最優先に考えて設計されています。本拡張機能は、ユーザーのいかなる個人情報やブラウジングデータを収集、送信、または共有することはありません。

This extension **Madobe** (hereinafter referred to as "the extension") is designed with user privacy as the top priority. The extension does not collect, transmit, or share any personal information or browsing data.

---

## 1. データの収集と保管について (Data Collection and Storage)

*   **ローカル保存の徹底 (Local-only storage)**
    *   本拡張機能で設定された動画壁紙（Blobデータ）およびウィジェットの配置・設定（JSONデータ）は、すべてユーザーが使用しているブラウザの内部ストレージ（IndexedDB および `chrome.storage.local`）にのみ保存されます。
    *   All video wallpapers (Blob data) and widget layouts/settings (JSON data) configured in the extension are stored strictly within the user's browser local storage (IndexedDB and `chrome.storage.local`).
*   **外部へのデータ送信なし (No external transmission)**
    *   これらのデータが開発者を含む外部のサーバーや第三者に送信、開示、または販売されることは一切ありません。
    *   None of this data is ever transmitted, disclosed, or sold to external servers or third parties, including the developer.

---

## 2. 使用する権限とその目的について (Permissions and Purposes)

本拡張機能は、以下の権限を正当な目的のためにのみ使用します。

The extension requests the following permissions strictly for the functions described below:

*   **`storage` (ストレージ)**
    *   **用途**：ユーザーが配置したウィジェットの座標・サイズ、ショートカットリンク、および音量やフォントなどの設定データを保存・復元するためにのみ使用します。
    *   **Purpose**: Used solely to save and restore settings data, including widget coordinates, sizes, shortcut links, volume, and font choices.
*   **`history` (閲覧履歴)**
    *   **用途**：検索バーウィジェットにおいて、ユーザーが入力したキーワードに対応するChromeの閲覧履歴（サジェスト候補）を動的に検索・表示するために使用します。この処理はすべてブラウザの内部で完結し、履歴データが外部に送信されることはありません。
    *   **Purpose**: Used inside the search bar widget to search and display suggested candidates from Chrome's local browsing history. This process runs entirely within the browser, and history data is never sent externally.
*   **`optional_host_permissions` (`*://*/*`) (オプショナルなホスト権限)**
    *   **用途**：ユーザーが明示的に設定した任意のRSSフィード（ニュース配信など）のURLから最新記事のデータを直接取得し、RSSウィジェットにティッカー表示するために使用します。取得したデータは画面上の表示にのみ使用され、トラッキング等には利用されません。
    *   **Purpose**: Used to directly fetch the latest feed data from any RSS feed URL explicitly registered by the user, for display within the RSS widget. The retrieved data is used only for display and is not used for tracking.

---

## 3. プライバシーポリシーの改定について (Changes to This Policy)

本拡張機能のアップデートや Chrome ウェブストアのポリシー変更に伴い、本ポリシーを必要に応じて改定することがあります。改定されたポリシーは、本リポジトリ上で公開された時点で効力を持つものとします。

This privacy policy may be updated from time to time to accommodate extension updates or Chrome Web Store policy changes. Any revised policy will become effective once published in this repository.

---

## 4. お問い合わせ (Contact)

本拡張機能およびプライバシーポリシーに関するご質問や不具合報告は、GitHubリポジトリの Issue にて受け付けております。

For any questions or bug reports regarding this extension and its privacy policy, please open an Issue on the GitHub repository.

**GitHub Repository**: [https://github.com/SetuyaSora/madobe](https://github.com/SetuyaSora/madobe)
