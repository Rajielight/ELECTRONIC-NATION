#!/usr/bin/env bash
set -euo pipefail

# ==== 設定 ====
PDF_URL="https://github.com/Rajielight/ELECTRONIC-NATION/blob/main/docs/assets/pdf/ELECTRONIC_NATION_Founding_Manifesto_v1_7_3.pdf"
INDEX_HTML="docs/index.html"
SCRIPT_JS="docs/assets/js/script.js"
TS="$(date +%Y%m%d-%H%M%S)"

# ==== 前提チェック ====
if [ ! -f "$INDEX_HTML" ]; then
  echo "ERROR: $INDEX_HTML が見つかりません。リポジトリのルートで実行してください。" >&2
  exit 1
fi

# ==== バックアップ ====
cp -f "$INDEX_HTML" "${INDEX_HTML}.bak.${TS}"
[ -f "$SCRIPT_JS" ] && cp -f "$SCRIPT_JS" "${SCRIPT_JS}.bak.${TS}"

# ==== 1) index.html の「理念（概要）」セクションを置換（経済の説明は外す） ====
python3 - "$PDF_URL" "$INDEX_HTML" <<'PY'
import sys, re, pathlib

pdf_url, index_path = sys.argv[1], sys.argv[2]
p = pathlib.Path(index_path)
s = p.read_text(encoding="utf-8")

new_block = f'''
    <section id="manifesto" class="section">
      <div class="container narrow">
        <h2>理念（概要）</h2>
        <p>
          私たちは、地理や国籍に縛られない<strong>新しい形態の「電子国家」</strong>をつくります。
          参加は本人の自由意思にもとづき、いつでも離脱できます。OpenPGP 鍵によるエイリアス（仮名）で参加でき、
          必要に応じて本名のデジタル証明を任意で結びつけられます。
        </p>
        <p>
          この取り組みは<strong>サイファーパンクの系譜</strong>に立っています。
          プライバシーを守りながら、必要なときに自分で選んで開示できる社会を、
          強い暗号と監査可能なオープンソースで実装します。
        </p>
        <p>
          インターネットが育んできた暗号通信・公開鍵基盤・ゼロ知識証明、
          そして<strong>ブロックチェーンの自然な拡張</strong>として、この電子国家を位置づけます。
          私たちはコードを公開し、誰もが検証し、参加できる形で運営します。
        </p>
        <div class="box">
          <a id="pdfLink" class="btn" href="{pdf_url}" target="_blank" rel="noopener">
            GitHubでマニフェストを開く（v1.7.3）
          </a>
          <p id="pdfStatus" class="note" aria-live="polite"></p>
        </div>
      </div>
    </section>
'''.lstrip()

# 既存の manifesto セクションを置換（大小文字や改行・空白にロバスト）
pattern = re.compile(r'<section\s+id=["\']manifesto["\'][\s\S]*?</section>', re.IGNORECASE)
if pattern.search(s):
    s = pattern.sub(new_block, s)
else:
    # セクションが見つからない場合は、リンクだけ差し替え（保険）
    s = re.sub(r'(<a[^>]+id=["\']pdfLink["\'][^>]+href=["\'])[^\"]*(\")',
               r'\1' + pdf_url + r'\2', s, flags=re.IGNORECASE)
    # target/rel を付与
    s = re.sub(r'(<a[^>]*id=["\']pdfLink["\'][^>]*)(?=>)',
               r'\1 target="_blank" rel="noopener"', s, flags=re.IGNORECASE)

p.write_text(s, encoding="utf-8")
print(f"Updated: {index_path}")
PY

# ==== 2) script.js の PDF リゾルバを無効化（存在すれば） ====
if [ -f "$SCRIPT_JS" ]; then
  python3 - "$SCRIPT_JS" <<'PY'
import sys, re, pathlib
js_path = pathlib.Path(sys.argv[1])
js = js_path.read_text(encoding="utf-8")

# 関数名を無効化（あれば）
js2 = re.sub(r'\bfunction\s+resolvePdf\s*\(', 'function resolvePdf_disabled(', js)

# 呼び出しをコメントアウト（複数あってもOK）
js2 = re.sub(r'\bresolvePdf\s*\(\s*\)\s*;', '/* resolvePdf disabled */', js2)

if js2 != js:
    js_path.write_text(js2, encoding="utf-8")
    print(f"Updated: {js_path} (resolver disabled)")
else:
    print(f"Skipped: {js_path}（該当コードなし）")
PY
else
  echo "Skipped: $SCRIPT_JS が存在しません。"
fi

echo
echo "✔ 変更完了。以下でコミット＆プッシュしてください："
echo "  git add $INDEX_HTML ${SCRIPT_JS:-} 2>/dev/null || true"
echo "  git commit -m \"manifesto: rewrite summary (JP); link to GitHub blob PDF; disable PDF resolver\""
echo "  git push origin main"
