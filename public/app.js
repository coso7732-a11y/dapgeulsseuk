/* 답글쓱 화면 동작: 버튼, 입력, 결과 표시를 연결합니다. 계산은 logic.js 가 합니다. */
(function () {
  "use strict";
  const L = window.Logic;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  // 사용자가 넣은 글을 화면에 넣을 때 HTML로 해석되지 않게 바꿉니다.
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 브라우저 저장 (실패해도 화면은 그대로 동작)
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 무시 */ } },
  };

  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요." }));
    if (!res.ok) throw Object.assign(new Error(data.error || "요청이 실패했어요."), { data });
    return data;
  }

  /* ---------------- 탭 이동 ---------------- */
  function showView(name) {
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    window.scrollTo(0, 0);
  }
  $$(".tab").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $$("[data-goto]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.goto)));

  /* ---------------- ③ 내 쇼핑몰 설정 (1-1) ---------------- */
  const SETTINGS_KEY = "dapgeul.settings";
  const FIELDS = ["storeName", "customerCall", "exchangePolicy", "shippingPolicy", "contactChannel", "closing", "bannedWords"];
  let settings = store.get(SETTINGS_KEY, { tone: "친근한" });

  function selectChip(container, tone) {
    container.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.tone === tone));
  }

  function fillSettingsForm() {
    const form = $("#settings-form");
    FIELDS.forEach((f) => { form.elements[f].value = settings[f] || ""; });
    selectChip($("#s-tone"), settings.tone || "친근한");
    renderPreview();
  }

  function readSettingsForm() {
    const form = $("#settings-form");
    const s = { tone: $("#s-tone .chip.active")?.dataset.tone || "친근한" };
    FIELDS.forEach((f) => { s[f] = form.elements[f].value.trim(); });
    return s;
  }

  function endDot(t) { return t && !/[.!?]$/.test(t) ? t + "." : t; }

  function renderPreview() {
    const s = readSettingsForm();
    const b = (v, ph) => v ? esc(v) : `<b>[${ph}]</b>`;
    $("#s-preview").innerHTML =
      `${b(s.customerCall, "고객 호칭")}, 사이즈가 맞지 않아 불편을 드려 죄송합니다. ` +
      `교환·환불은 ${s.exchangePolicy ? esc(endDot(s.exchangePolicy)) : "<b>[교환·환불 안내]</b>"} ` +
      `문의는 ${b(s.contactChannel, "문의 채널")}로 남겨 주세요. ${b(s.closing, "마지막 인사말")}`;
  }

  $("#s-tone").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    selectChip($("#s-tone"), chip.dataset.tone);
  });
  $("#settings-form").addEventListener("input", renderPreview);
  $("#settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    settings = readSettingsForm();
    store.set(SETTINGS_KEY, settings);
    const msg = $("#settings-msg");
    msg.className = "msg ok";
    msg.textContent = "저장했어요. 이 브라우저에 남아 있어요.";
    toast("설정을 저장했어요");
    replyViews.forEach((v) => v.render());
  });

  /* ---------------- ① 리뷰 답글 / 문의 답글 (파일로 한 번에 넣기) ---------------- */
  // 두 화면은 모양이 같고, 아래 설정값만 다릅니다.
  const REPLY_CONFIG = {
    review: {
      title: "리뷰 답글, 쓱 대신 써드려요",
      sub: "리뷰 파일을 올리고 리뷰를 고르면 쇼핑몰 말투에 맞는 답글 초안을 만들어 드려요. 마지막 확인은 사장님이 해요.",
      fileTitle: "리뷰 파일 넣기",
      columns: L.REQUIRED_COLUMNS,
      textCol: "리뷰내용",
      sampleUrl: "/data/sample_reviews.csv",
      sampleLabel: "가상 리뷰 불러오기 (15행)",
      listTitle: "받은 리뷰",
      empty: "아직 받은 리뷰가 없어요. 위에서 리뷰 CSV 파일을 올려 주세요.",
      panelEmpty: "왼쪽에서 리뷰를 고르면 여기에 답글 초안이 나와요.",
      originalLabel: "고객 리뷰",
      notice: "AI가 만든 초안이에요. 환불·교환 같은 약속이 들어간 답글은 올리기 전에 꼭 직접 확인해 주세요.",
      copyHelp: "복사하면 이 리뷰는 '답글 완료'로 바뀌어요. 스마트스토어 리뷰 관리 화면에 붙여 넣어 올리세요.",
      unit: "리뷰",
    },
    inquiry: {
      title: "문의 답글, 쓱 대신 써드려요",
      sub: "문의 파일을 올리고 문의를 고르면 내 쇼핑몰 정책에 맞춘 답글 초안을 만들어 드려요. 정책에 없는 질문은 추측하지 않고 비워 둬요.",
      fileTitle: "문의 파일 넣기",
      columns: L.INQUIRY_COLUMNS,
      textCol: "문의내용",
      sampleUrl: "/data/sample_inquiries.csv",
      sampleLabel: "가상 문의 불러오기 (8행)",
      listTitle: "받은 문의",
      empty: "아직 받은 문의가 없어요. 위에서 문의 CSV 파일을 올려 주세요.",
      panelEmpty: "왼쪽에서 문의를 고르면 여기에 답글 초안이 나와요.",
      originalLabel: "고객 문의",
      notice: "AI가 만든 초안이에요. 배송 상황·재고처럼 주문 정보가 필요한 내용은 [대괄호]로 남겨 뒀어요. 직접 확인해 채워 주세요.",
      copyHelp: "복사하면 이 문의는 '답글 완료'로 바뀌어요. 스마트스토어 문의 관리 화면에 붙여 넣어 올리세요.",
      unit: "문의",
    },
  };

  function settingsEmpty() {
    return !settings.exchangePolicy && !settings.contactChannel && !settings.customerCall;
  }

  function setupReplyView(kind) {
    const cfg = REPLY_CONFIG[kind];
    const root = document.getElementById("view-" + kind);
    root.appendChild($("#reply-template").content.cloneNode(true));
    const el = (name) => root.querySelector(`[data-r="${name}"]`);

    el("title").textContent = cfg.title;
    el("sub").textContent = cfg.sub;
    el("file-title").textContent = cfg.fileTitle;
    el("file-cols").textContent = `열 ${cfg.columns.length}개가 있어야 해요: ${cfg.columns.join(", ")}`;
    el("load-sample").textContent = cfg.sampleLabel;
    el("list-title").textContent = cfg.listTitle;
    el("panel-empty").textContent = cfg.panelEmpty;
    el("original-label").textContent = cfg.originalLabel;
    el("notice").textContent = cfg.notice;
    el("copy-help").textContent = cfg.copyHelp;

    const KEY = "dapgeul.list." + kind;
    let items = store.get(KEY, []);   // [{id, date, group, rating, text, draft, status}]
    let selectedId = null;
    let tone = settings.tone || "친근한";
    const save = () => store.set(KEY, items);
    const selected = () => items.find((x) => x.id === selectedId);

    function showErrors(list) { el("errors").innerHTML = list.map((e) => `<li>${esc(e)}</li>`).join(""); }

    // CSV 글 → 검사 → 목록으로
    function loadCSV(text, sourceName) {
      const { rows, errors } = L.validateCSV(text, cfg.columns);
      if (errors.length) {
        showErrors(errors.slice(0, 10).concat(errors.length > 10 ? [`그 밖에 ${errors.length - 10}개 문제가 더 있어요.`] : []));
        return;
      }
      const hasWork = items.some((x) => x.draft);
      if (hasWork && !confirm(`지금 목록에 만들어 둔 답글 초안이 있어요. 새 파일로 바꾸면 지금 목록은 사라져요. 바꿀까요?`)) return;
      showErrors([]);
      const idCol = cfg.columns[0];
      items = rows.map((r) => ({
        id: r[idCol], date: r.작성일, group: r.상품군, rating: r.별점 ? Number(r.별점) : null,
        text: r[cfg.textCol], draft: "", status: "wait",
      }));
      selectedId = items[0]?.id || null;
      save(); render();
      toast(`${sourceName}에서 ${cfg.unit} ${items.length}개를 불러왔어요`);
    }

    el("file").addEventListener("change", (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => loadCSV(String(reader.result), file.name);
      reader.onerror = () => showErrors(["파일을 읽지 못했어요."]);
      reader.readAsText(file, "utf-8");
      e.target.value = "";
    });

    el("load-sample").addEventListener("click", async () => {
      try {
        const res = await fetch(cfg.sampleUrl);
        if (!res.ok) throw new Error();
        loadCSV(await res.text(), "가상 데이터");
      } catch {
        showErrors(["가상 데이터를 불러오지 못했어요. 서버가 켜져 있는지 확인해 주세요."]);
      }
    });

    el("clear").addEventListener("click", () => {
      if (!confirm(`받은 ${cfg.unit} 목록과 만들어 둔 초안을 모두 지울까요?`)) return;
      items = []; selectedId = null; save(); render();
    });

    function renderStats() {
      el("stat-wait").textContent = items.filter((x) => x.status !== "done").length + "개";
      el("stat-done").textContent = items.filter((x) => x.status === "done").length + "개";
      el("stat-fill").textContent = items.filter((x) => L.hasBlank(x.draft)).length + "개";
    }

    function renderList() {
      el("clear").hidden = !items.length;
      el("list").innerHTML = !items.length ? `<p class="empty">${esc(cfg.empty)}</p>` :
        items.map((x) => `
        <button class="review-item ${x.id === selectedId ? "selected" : ""}" data-id="${esc(x.id)}">
          <div class="meta">
            <b>${x.rating ? `별점 ${x.rating}점` : esc(x.group)}<span class="id">${esc(x.id)} · ${esc(x.date)}</span></b>
            <span>
              ${L.hasBlank(x.draft) && x.status !== "done" ? '<span class="pill fill">채울 곳 있음</span>' : ""}
              <span class="pill ${x.status === "done" ? "done" : ""}">${x.status === "done" ? "답글 완료" : "답글 대기"}</span>
            </span>
          </div>
          <div class="text">${esc(x.text)}</div>
        </button>`).join("");
      renderStats();
    }

    function updateDraftChecks() {
      const text = el("draft").value;
      el("count").textContent = text.length + "자";
      const banned = L.findBanned(text, settings.bannedWords);
      el("banned").hidden = !banned.length;
      el("banned").textContent = banned.length ? `쓰고 싶지 않은 표현이 들어 있어요: ${banned.join(", ")}` : "";
      el("fill").hidden = !L.hasBlank(text);
    }

    function renderPanel() {
      const x = selected();
      el("panel-empty").hidden = !!x;
      el("panel").hidden = !x;
      if (!x) return;
      el("original").textContent = `${x.id} · ${x.group}${x.rating ? ` · 별점 ${x.rating}점` : ""} · ${x.text}`;
      selectChip(el("tones"), tone);
      el("store-warn").hidden = !settingsEmpty();
      el("draft-area").hidden = !x.draft;
      el("draft").value = x.draft || "";
      el("note").textContent = x.note || "";
      updateDraftChecks();
    }

    function render() { renderList(); renderPanel(); }

    el("list").addEventListener("click", (e) => {
      const item = e.target.closest(".review-item"); if (!item) return;
      selectedId = item.dataset.id; render();
    });

    el("tones").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip"); if (!chip) return;
      tone = chip.dataset.tone; selectChip(el("tones"), tone);
    });

    el("make").addEventListener("click", async () => {
      const x = selected(); if (!x) return;
      const btn = el("make");
      btn.disabled = true; btn.textContent = isMock ? "만드는 중…" : "AI가 쓰는 중… (10초 안팎)";
      try {
        const data = await postJSON("/api/reply", { kind, text: x.text, rating: x.rating, tone, store: settings });
        showErrors([]);
        x.draft = data.draft; x.note = data.note || (data.topic ? `AI가 본 주제: ${data.topic}` : ""); x.status = "wait";
        save(); render();
      } catch (err) {
        showErrors([err.message]); toast(err.message);
      } finally {
        btn.disabled = false; btn.textContent = "답글 초안 만들기";
      }
    });

    el("draft").addEventListener("input", () => {
      const x = selected(); if (!x) return;
      x.draft = el("draft").value; save();
      updateDraftChecks(); renderStats();
    });

    el("copy").addEventListener("click", async () => {
      const x = selected(); if (!x || !x.draft) return;
      await copyText(x.draft);
      x.status = "done"; save(); renderList();
      toast(L.hasBlank(x.draft) ? "복사했어요. [대괄호] 자리를 꼭 채워 주세요" : "복사했어요");
    });

    el("next").addEventListener("click", () => {
      const i = items.findIndex((x) => x.id === selectedId);
      const next = items.slice(i + 1).concat(items.slice(0, i)).find((x) => x.status !== "done");
      if (!next) return toast(`대기 중인 ${cfg.unit}가 없어요`);
      selectedId = next.id; render();
    });

    return { render };
  }

  const replyViews = [setupReplyView("review"), setupReplyView("inquiry")];

  /* ---------------- ② 리포트 (1-3 ~ 1-11) ---------------- */
  let period = "주간";
  let report = null; // { rows, classifications, todos }

  function setPeriod(p) {
    period = p;
    $$(".period-btn").forEach((b) => b.classList.toggle("active", b.dataset.period === p));
    $("#report-title").textContent = `${p} 리뷰 리포트`;
  }
  $$(".period-btn").forEach((b) => b.addEventListener("click", () => {
    setPeriod(b.dataset.period);
    if (report) renderReport();
  }));

  function showErrors(list) {
    $("#csv-errors").innerHTML = list.map((e) => `<li>${esc(e)}</li>`).join("");
  }

  $("#load-sample").addEventListener("click", async () => {
    try {
      const res = await fetch("/data/sample_reviews.csv");
      if (!res.ok) throw new Error();
      $("#csv-input").value = (await res.text()).trim();
      showErrors([]);
      toast("가상 리뷰 15행을 불러왔어요");
    } catch {
      showErrors(["가상 데이터를 불러오지 못했어요. 서버가 켜져 있는지 확인해 주세요."]);
    }
  });

  $("#csv-file").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { $("#csv-input").value = String(reader.result).trim(); showErrors([]); toast(`${file.name}을 올렸어요`); };
    reader.onerror = () => showErrors(["파일을 읽지 못했어요."]);
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  });

  $("#make-report").addEventListener("click", async () => {
    const { rows, errors } = L.validateCSV($("#csv-input").value);
    if (errors.length) {
      showErrors(errors.slice(0, 10).concat(errors.length > 10 ? [`그 밖에 ${errors.length - 10}개 문제가 더 있어요.`] : []));
      $("#report-result").hidden = true;
      return;
    }
    showErrors([]);
    const btn = $("#make-report");
    btn.disabled = true;
    btn.textContent = isMock ? "만드는 중…" : `AI가 분석하는 중… (리뷰 ${rows.length}개, 1분 안팎)`;
    try {
      const data = await postJSON("/api/report", { rows, period });
      report = { rows, classifications: data.classifications, todos: data.todos || [], mock: data.mock, missing: data.missing || [] };
      renderReport();
      $("#report-result").hidden = false;
      $("#report-result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showErrors([err.message]);
      $("#report-result").hidden = true;
    } finally {
      btn.disabled = false; btn.textContent = "리포트 만들기";
    }
  });

  function fmtDate(d) { const [, m, day] = d.split("-"); return `${Number(m)}월 ${Number(day)}일`; }

  function renderReport() {
    const { rows, classifications, todos } = report;
    const byId = Object.fromEntries(rows.map((r) => [r.review_id, r]));
    const summary = L.aggregate(classifications);            // 원인별 요약 (직접 셈)
    const complaints = L.complaintsOnly(summary);
    const check = L.checkTotals(rows, classifications);       // 합계 검산
    const range = L.dateRange(rows);
    const rangeText = range ? `${fmtDate(range.from)} ~ ${fmtDate(range.to)}` : "";
    const needCheck = classifications.filter(L.needsCheck);
    const complaintReviews = classifications.filter((c) => c.categories.some((x) => !L.NON_COMPLAINT.includes(x)));

    $("#report-title").textContent = `${period} 리뷰 리포트`;
    $("#report-range").textContent = rangeText ? `(${rangeText})` : "";
    $("#r-count").textContent = rows.length + "건";
    $("#r-avg").textContent = L.averageRating(rows) + "점";
    $("#r-check").textContent = needCheck.length + "건";

    // 한눈에 보기
    let sentence = `${rangeText} 동안 받은 리뷰 ${rows.length}건 중 ${complaintReviews.length}건에 불만이 있었어요.`;
    if (complaints[0]) sentence += ` 가장 많은 원인은 '${complaints[0].category}'(${complaints[0].count}건)이고`;
    if (complaints[1]) sentence += `, '${complaints[1].category}'(${complaints[1].count}건)이 뒤를 이어요.`;
    else if (complaints[0]) sentence += "예요.";
    $("#r-summary").textContent = sentence;

    // 불만 원인 순위 (= 원인별 요약: 원인, 개수, 해당 리뷰 번호)
    const max = complaints[0]?.count || 1;
    $("#r-bars").innerHTML = complaints.map((x, i) => `
      <div class="bar-item">
        <div class="bar-head"><span>${i + 1}위 ${esc(x.category)}</span><span>${x.count}건</span></div>
        <div class="bar"><i style="width:${(x.count / max) * 100}%"></i></div>
        <div class="bar-ids">해당 리뷰: ${x.ids.map(esc).join(", ")}</div>
      </div>`).join("") || '<p class="empty">불만 원인이 없어요.</p>';
    const others = summary.filter((x) => L.NON_COMPLAINT.includes(x.category));
    $("#r-others").textContent = others.map((x) => `${x.category} ${x.count}건 (${x.ids.join(", ")})`).join(" · ");

    // 해 볼 일 3가지 — 근거 개수는 위 집계에서 가져옴
    const countOf = (cat) => (summary.find((x) => x.category === cat) || { count: 0 }).count;
    $("#r-todos").innerHTML = todos.slice(0, 3).map((t, i) => `
      <div class="todo" data-i="${i}">
        <b>${esc(t.title)} <span class="muted small">(근거 ${countOf(t.category)}건 · ${esc(t.category)})</span></b>
        <p>${esc(t.detail)}</p>
        <button class="btn ghost todo-done">완료로 표시</button>
      </div>`).join("");

    // 대표 리뷰: 상위 불만 원인 2개의 첫 리뷰
    $("#r-quotes").innerHTML = complaints.slice(0, 2).map((x) => `
      <div class="quote"><span class="tag">${esc(x.category)}</span><br>${esc(byId[x.ids[0]]?.리뷰내용)}</div>`).join("");

    // 리뷰별 분류표 (복합·판단불가 강조)
    $("#r-table").innerHTML = classifications.map((c) => {
      const r = byId[c.review_id] || {};
      const flag = L.isComplex(c) ? "복합" : c.categories.includes("판단불가") ? "판단불가" : "";
      return `<tr class="${flag ? "need-check" : ""}">
        <td>${esc(c.review_id)}</td><td>${esc(r.상품군)}</td><td>${esc(r.별점)}</td>
        <td>${c.categories.map(esc).join(", ")}</td><td>${esc(c.reason)}</td>
        <td>${flag ? `<span class="check-flag">⚠ ${flag}</span>` : "-"}</td></tr>`;
    }).join("");

    // 검수용 한 줄
    $("#r-checkline").innerHTML =
      `검수: 리뷰 ${check.reviewCount}개 · 분류 합계 ${check.total}개 ` +
      `(= ${check.reviewCount} + 복합 추가분 ${check.extra}) · ` +
      `복합 ${check.complexIds.join(", ") || "없음"} · 판단불가 ${check.unknownIds.join(", ") || "없음"} → ` +
      (check.pass ? '<span class="pass">합계 통과</span>' : '<span class="fail">합계 불일치, 직접 확인 필요</span>');

    $("#r-mock-note").textContent = report.mock
      ? "1단계 모의 모드: 분류·근거·할 일은 미리 만든 샘플이에요. 개수·합계·평균은 화면이 직접 셌어요."
      : "분류·근거·할 일은 AI가 만들었어요. 개수·합계·평균은 화면이 직접 셌어요." +
        (report.missing.length ? ` AI가 빠뜨린 리뷰 ${report.missing.join(", ")}는 '판단불가'로 두었어요. 직접 확인해 주세요.` : "");
  }

  $("#r-todos").addEventListener("click", (e) => {
    const btn = e.target.closest(".todo-done"); if (!btn) return;
    const box = btn.closest(".todo");
    box.classList.toggle("done");
    btn.textContent = box.classList.contains("done") ? "완료 취소" : "완료로 표시";
  });

  function reportText() {
    const { rows, classifications, todos } = report;
    const summary = L.aggregate(classifications);
    const check = L.checkTotals(rows, classifications);
    const byId = Object.fromEntries(rows.map((r) => [r.review_id, r]));
    const countOf = (cat) => (summary.find((x) => x.category === cat) || { count: 0 }).count;
    const lines = [];
    lines.push(`[${$("#report-title").textContent}] ${$("#report-range").textContent}`, "");
    lines.push("① 리뷰별 분류표", "번호 | 상품군 | 별점 | 분류 | 한 줄 근거 | 사람 확인");
    classifications.forEach((c) => {
      const r = byId[c.review_id] || {};
      const flag = L.isComplex(c) ? "복합" : c.categories.includes("판단불가") ? "판단불가" : "-";
      lines.push(`${c.review_id} | ${r.상품군} | ${r.별점} | ${c.categories.join(", ")} | ${c.reason} | ${flag}`);
    });
    lines.push("", "② 원인별 요약", "원인 | 개수 | 해당 리뷰");
    summary.forEach((x) => lines.push(`${x.category} | ${x.count} | ${x.ids.join(", ")}`));
    lines.push("", "③ 할 일 3줄");
    todos.slice(0, 3).forEach((t, i) => lines.push(`${i + 1}. ${t.title} (근거 ${countOf(t.category)}건)`));
    lines.push("", "④ 검수",
      `리뷰 ${check.reviewCount}개, 분류 합계 ${check.total}개, 복합 ${check.complexIds.join(", ") || "없음"}, ` +
      `판단불가 ${check.unknownIds.join(", ") || "없음"}, ${check.pass ? "합계 통과" : "합계 불일치"}`);
    return lines.join("\n");
  }

  $("#copy-report").addEventListener("click", async () => {
    if (!report) return;
    await copyText(reportText());
    toast("리포트를 복사했어요");
  });

  /* ---------------- 모드 표시 (모의 / AI) ---------------- */
  let isMock = true;
  async function loadStatus() {
    const badge = document.querySelector(".badge-mock");
    try {
      const st = await (await fetch("/api/status")).json();
      isMock = st.mode === "mock";
      if (isMock) {
        badge.textContent = "모의 모드 · 샘플 결과";
      } else {
        badge.textContent = st.hasKey ? `AI 모드 · ${st.model}` : "AI 모드 · 키 없음";
        badge.classList.toggle("off", !st.hasKey);
        badge.title = st.hasKey ? "" : "답글쓱 폴더의 .env 파일에 AI 키를 넣고 서버를 다시 켜 주세요.";
      }
    } catch {
      badge.textContent = "서버 연결 안 됨";
      badge.classList.add("off");
    }
  }

  /* ---------------- 시작 ---------------- */
  loadStatus();
  fillSettingsForm();
  setPeriod("주간");
})();
