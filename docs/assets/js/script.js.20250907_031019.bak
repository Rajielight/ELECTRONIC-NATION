(function () {
  // Mobile menu
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("menu");
  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  // Theme toggle
  const themeBtn = document.getElementById("themeToggle");
  const apply = (mode) => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem("theme", mode);
  };
  apply(localStorage.getItem("theme") || "dark");
  themeBtn?.addEventListener("click", () => {
    const now = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    apply(now);
    themeBtn.textContent = now === "dark" ? "☾" : "☼";
  });

  // Year
  document.getElementById("year").textContent = new Date().getFullYear();

  // Join form → GitHub Issue
  const form = document.getElementById("joinForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const display = (data.get("display") || "").toString().trim();
      const kind = (data.get("kind") || "").toString();
      const fp = (data.get("fingerprint") || "").toString().replace(/\s+/g, "");
      const pgp = (data.get("pgp") || "").toString().trim();
      const contact = (data.get("contact") || "").toString().trim();

      if (!/^[0-9a-fA-F]{16,40}$/.test(fp)) {
        alert("Fingerprintの形式が不正です（16〜40桁のHEX、スペースなし）。");
        return;
      }
      if (!pgp.includes("BEGIN PGP PUBLIC KEY BLOCK")) {
        alert("PGP公開鍵（ASCIIアーマー）を貼り付けてください。");
        return;
      }

      const lines = [
        `### Citizen Application`,
        `**Display Name**: ${display}`,
        `**Category**: ${kind === "realname" ? "Real-name" : "Alias"}`,
        `**PGP Fingerprint**: \`${fp}\``,
        `**PGP Public Key**:\\n\\n\`\`\`\\n${pgp}\\n\`\`\``,
        contact ? `**Contact**: ${contact}` : "",
        `**Acknowledgement**: I accept the early-access fees/renewal terms.`,
      ].filter(Boolean);

      const body = encodeURIComponent(lines.join("\\n"));
      const title = encodeURIComponent(\`Citizen Application: \${display}\`);
      const url = \`https://github.com/Rajielight/ELECTRONIC-NATION/issues/new?title=\${title}&body=\${body}\`;
      window.open(url, "_blank", "noopener");
    });
  }

  // ---- Manifesto PDF resolver ----
  async function resolvePdf_disabled() {
    const link = document.getElementById("pdfLink");
    const status = document.getElementById("pdfStatus");
    if (!link) return;

    const base = "assets/pdf/";
    const candidates = [
      "manifesto_v1_7_3.pdf",
      "ELECTRONIC_NATION_Founding_Manifesto_v1_7_3.pdf",
      "ELECTRONIC_NATION_Founding_Manifesto_v1_7_3_FINAL_FULL.pdf",
      "ELECTRONIC_NATION_Founding_Manifesto_v1_7_3_FINAL.pdf"
    ];

    for (const name of candidates) {
      const url = base + name + "?v=173"; // bust cache
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) {
          link.href = base + name + "?v=173";
          status.textContent = "";
          return;
        }
      } catch (_e) {}
    }
    // Not found
    link.setAttribute("aria-disabled", "true");
    link.classList.remove("btn");
    link.style.pointerEvents = "none";
    status.textContent = "PDFが見つかりません。リポジトリの docs/assets/pdf/ に配置してください。";
  }
  /* resolvePdf disabled */
})();
