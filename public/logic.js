/* 답글쓱 계산 부분 (AI 없음)
 * - CSV 읽기, 입력 검사, 원인별 집계, 합계 검산
 * - 화면과 상관없이 계산만 하므로, 나중에 테스트하기 쉽습니다.
 */
(function (root) {
  "use strict";

  // 리뷰 CSV에 꼭 있어야 하는 열 5개 (PRD 9장)
  const REQUIRED_COLUMNS = ["review_id", "작성일", "상품군", "별점", "리뷰내용"];
  // 문의 CSV 열 4개 (별점 없음)
  const INQUIRY_COLUMNS = ["inquiry_id", "작성일", "상품군", "문의내용"];

  // 분류 8개 (PRD 8장). 순서는 개수가 같을 때의 표시 순서로도 씁니다.
  const CATEGORIES = [
    "배송", "포장", "상품 품질", "사이즈·상품정보 불일치",
    "응대·교환·환불", "안내 부족", "칭찬", "판단불가",
  ];
  const NON_COMPLAINT = ["칭찬", "판단불가"];

  /** CSV 글을 줄과 칸으로 나눕니다. 따옴표("...") 안의 쉼표·줄바꿈도 처리합니다. */
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", inQuotes = false;
    const s = text.replace(/^﻿/, ""); // 엑셀이 붙이는 BOM 제거
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cell += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && s[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    // 완전히 빈 줄은 버림
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  /**
   * CSV를 검사합니다 (PRD 1-4).
   * columns: 꼭 있어야 하는 열 목록 (기본은 리뷰 5개 열)
   * 돌려주는 값: { rows: [{review_id, 작성일, 상품군, 별점, 리뷰내용}], errors: ["쉬운 문장", ...] }
   */
  function validateCSV(text, columns) {
    const COLS = columns || REQUIRED_COLUMNS;
    const idCol = COLS[0];
    const errors = [];
    if (!text || !text.trim()) {
      return { rows: [], errors: ["CSV 칸이 비어 있어요. 붙여 넣거나 파일을 올려 주세요."] };
    }
    const table = parseCSV(text);
    const header = table[0].map((h) => h.trim());
    const missing = COLS.filter((c) => !header.includes(c));
    const extra = header.filter((h) => !COLS.includes(h));
    if (missing.length) {
      errors.push(`열 이름이 맞지 않아요. 없는 열: ${missing.join(", ")}` +
        (extra.length ? ` / 모르는 열: ${extra.join(", ")}` : "") +
        ` (필요한 열: ${COLS.join(", ")})`);
      return { rows: [], errors };
    }
    if (table.length < 2) {
      return { rows: [], errors: ["열 이름 줄만 있고 리뷰가 없어요."] };
    }

    const idx = Object.fromEntries(COLS.map((c) => [c, header.indexOf(c)]));
    const rows = [];
    const seen = new Set();
    table.slice(1).forEach((cells, i) => {
      const line = i + 2; // 사람이 보는 줄 번호 (첫 줄이 열 이름)
      if (cells.length !== header.length) {
        errors.push(`${line}번째 줄: 칸 수가 ${cells.length}개예요. ${header.length}개여야 해요. (리뷰에 쉼표가 있으면 리뷰 내용을 "큰따옴표"로 감싸 주세요.)`);
        return;
      }
      const r = {};
      COLS.forEach((c) => { r[c] = (cells[idx[c]] || "").trim(); });
      const empties = COLS.filter((c) => !r[c]);
      if (empties.length) errors.push(`${line}번째 줄: 빈 칸이 있어요 (${empties.join(", ")}).`);
      if (COLS.includes("별점") && r.별점 && !/^[1-5]$/.test(r.별점)) errors.push(`${line}번째 줄: 별점은 1~5 사이 숫자여야 해요 (지금: ${r.별점}).`);
      if (r.작성일 && !/^\d{4}-\d{2}-\d{2}$/.test(r.작성일)) errors.push(`${line}번째 줄: 작성일은 2026-11-16 모양으로 적어 주세요 (지금: ${r.작성일}).`);
      if (r[idCol]) {
        if (seen.has(r[idCol])) errors.push(`${line}번째 줄: ${idCol} ${r[idCol]}가 겹쳐요.`);
        seen.add(r[idCol]);
      }
      rows.push(r);
    });
    return { rows: errors.length ? [] : rows, errors };
  }

  /**
   * 원인별 집계 (PRD 1-8, 출력 ② 원인별 요약)
   * classifications: [{review_id, categories: [...]}]
   * 돌려주는 값: [{category, count, ids: [...]}] — 개수 많은 순, 같으면 CATEGORIES 순
   */
  function aggregate(classifications) {
    const map = new Map(CATEGORIES.map((c) => [c, []]));
    classifications.forEach((c) => {
      c.categories.forEach((cat) => {
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat).push(c.review_id);
      });
    });
    return [...map.entries()]
      .map(([category, ids]) => ({ category, count: ids.length, ids }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count ||
        CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
  }

  /** 불만 원인만 (칭찬·판단불가 제외) */
  function complaintsOnly(summary) {
    return summary.filter((x) => !NON_COMPLAINT.includes(x.category));
  }

  /** 복합 리뷰 = 분류가 2개 이상인 리뷰 */
  function isComplex(c) { return c.categories.length >= 2; }
  function needsCheck(c) { return isComplex(c) || c.categories.includes("판단불가"); }

  /**
   * 합계 검산 (PRD 11장 1번)
   * 분류 합계 = 리뷰 수 + 복합 리뷰의 추가 분류 수 인지 계산합니다.
   */
  function checkTotals(rows, classifications) {
    const reviewCount = rows.length;
    const total = classifications.reduce((n, c) => n + c.categories.length, 0);
    const complex = classifications.filter(isComplex);
    const extra = complex.reduce((n, c) => n + (c.categories.length - 1), 0);
    const unknown = classifications.filter((c) => c.categories.includes("판단불가")).map((c) => c.review_id);
    const rowIds = rows.map((r) => r.review_id).sort().join(",");
    const clsIds = classifications.map((c) => c.review_id).sort().join(",");
    const invalid = classifications.filter((c) => !c.categories.length ||
      c.categories.some((cat) => !CATEGORIES.includes(cat))).map((c) => c.review_id);
    return {
      reviewCount, total, extra,
      complexIds: complex.map((c) => c.review_id),
      unknownIds: unknown,
      sameReviews: rowIds === clsIds,   // 모든 리뷰가 빠짐없이 분류됐는지
      invalidIds: invalid,              // 분류가 비었거나 8개 밖인 리뷰
      pass: total === reviewCount + extra && rowIds === clsIds && !invalid.length,
    };
  }

  /** 평균 별점 (소수 첫째 자리) */
  function averageRating(rows) {
    if (!rows.length) return 0;
    const sum = rows.reduce((n, r) => n + Number(r.별점), 0);
    return Math.round((sum / rows.length) * 10) / 10;
  }

  /** 작성일 처음~끝 */
  function dateRange(rows) {
    const ds = rows.map((r) => r.작성일).filter(Boolean).sort();
    return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
  }

  /** 쓰고 싶지 않은 표현이 초안에 있는지 찾기 */
  function findBanned(text, bannedCsv) {
    return (bannedCsv || "").split(",").map((w) => w.trim()).filter((w) => w && text.includes(w));
  }

  /** [대괄호] 빈자리가 있는지 */
  function hasBlank(text) { return /\[[^\]]+\]/.test(text || ""); }

  const api = {
    REQUIRED_COLUMNS, INQUIRY_COLUMNS, CATEGORIES, NON_COMPLAINT,
    parseCSV, validateCSV, aggregate, complaintsOnly, isComplex, needsCheck,
    checkTotals, averageRating, dateRange, findBanned, hasBlank,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== "undefined" ? window : globalThis);
