#!/usr/bin/env bash
set -euo pipefail

INDEX_HTML="docs/index.html"
PDF_FALLBACK_URL="https://github.com/Rajielight/ELECTRONIC-NATION/blob/main/docs/assets/pdf/ELECTRONIC_NATION_Founding_Manifesto_v1_7_3.pdf"
TS="$(date +%Y%m%d-%H%M%S)"

# 前提チェック
if [ ! -f "$INDEX_HTML" ]; then
  echo "ERROR: $INDEX_HTML が見つかりません。リポジトリのルートで実行してください。" >&2
  exit 1
fi

# バックアップ
cp -f "$INDEX_HTML" "${INDEX_HTML}.bak.${TS}"

# Pythonで manifesto セクションを置換
python3 - "$INDEX_HTML" "$PDF_FALLBACK_URL" <<'PY'
import sys, re, pathlib

index_path, fallback_url = sys.argv[1], sys.argv[2]
p = pathlib.Path(index_path)
s = p.read_text(encoding="utf-8")

# 既存 #pdfLink の href を継承（無ければフォールバックURL）
m = re.search(r'id=["\']pdfLink["\'][^>]*href=["\']([^"\']+)["\']', s, re.IGNORECASE)
pdf_url = m.group(1) if m else fallback_url

# 指定の新テキスト（経済の説明は含めない）
para1 = (
    "私たちは、地理や国籍に縛られない新しい形態の「電子国家」をつくります。"
    "参加は本人の自由意思にもとづき、いつでも離脱できます。"
    "ニックネームで参加でき、身元を明かす必要はありません。"
)
para2 = (
    "この取り組みはサイファーパンクへのリスペクトから始まっています。"
    "プライバシーを守りながら、既存の国家の理不尽な規制や暴力に影響されにくい共同体を、"
    "強い暗号と監査可能なオープンソースで実装します。"
)
para3 = (
    "インターネットが育んできた暗号通信・公開鍵基盤・ゼロ知識証明、"
    "そしてブロックチェーンの自然な拡張として、この電子国家は産声を上げました。"
    "私たちはコードを公開し、誰もが検証し、参加できる形で運営します。"
)

new_block = f'''
    <section id="manifesto" class="section">
      <div class="container narrow">
        <h2>理念（概要）</h2>
        <p>{para1}</p>
        <p>{para2}</p>
        <p>{para3}</p>
        <div class="box">
          <a id="pdfLink" class="btn" href="{pdf_url}" target="_blank" rel="noopener">
            GitHubでマニフェストを開く（v1.7.3）
          </a>
          <p id="pdfStatus" class="note" aria-live="polite"></p>
        </div>
      </div>
    </section>
'''.lstrip()

# manifesto セクションの開始〜終了を置換
pattern = re.compile(r'<section\s+id=["\']manifesto["\'][\s\S]*?</section>', re.IGNORECASE)
if pattern.search(s):
    s = pattern.sub(new_block, s)
else:
    # セクションが見つからない場合は、保険として #pdfLink のURLだけ差し替え
    s = re.sub(r'(<a[^>]+id=["\']pdfLink["\'][^>]+href=["\'])[^\"]*(\")',
               r'\1' + pdf_url + r'\2', s, flags=re.IGNORECASE)

p.write_text(s, encoding="utf-8")
print(f"Updated: {index_path}")
PY

echo
echo "✔ 変更完了。以下でコミット＆プッシュしてください："
echo "  git add ${INDEX_HTML}"
echo "  git commit -m \"manifesto: replace summary text (plain JP, no-economy); keep existing PDF link\""
echo "  git push origin main"
