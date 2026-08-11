// tr_get_kyobobook_info.js  (v2)
//
// 상세 페이지 HTML에는 저자가 없다(Next.js 클라이언트 렌더링). meta 태그에 이름이 보이는 건
// 책 소개문에 우연히 섞인 것일 뿐. 따라서 저자/카테고리/출판사는 검색 자동완성 API에서 가져온다.
//
//   1) 상세 HTML  -> og:image 에서 ISBN, og:title 에서 제목, 목차, 출간일
//   2) 검색 API   -> ISBN 으로 조회 -> TOT_RELATE_HTML_LIST 를 $@ 로 쪼개 저자/카테고리/출판사
//
// requestUrl 안 씀. Templater 전역 request() 만 사용.

const DEBUG = true; // 안정화되면 false

function log(...a) {
  if (DEBUG) console.log("[kyobo]", ...a);
}

async function fetchText(url, headers) {
  try {
    return await request(headers ? { url, headers } : { url });
  } catch (e) {
    log("fetch 실패:", url, e && e.message ? e.message : e);
    return "";
  }
}

function parseJsonLoose(txt) {
  if (!txt) return null;
  let s = txt.trim();
  const m = s.match(/^[A-Za-z_$][\w$]*\(([\s\S]*)\)\s*;?$/); // jsonp 껍데기
  if (m) s = m[1];
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

const SUB_ROLE = /번역|옮긴이|역자|감수|그림|만화|각색|엮음|사진|편집|해설|낭독/;

function splitAuthors(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/\s*[,;|·]\s*|\s+외\s*$/)
    .map((n) => n.replace(/\s*\((지은이|글|그림|저|원작|저자)\)\s*/g, "").trim())
    .filter((n) => n && n.length >= 2 && n.length <= 40 && !SUB_ROLE.test(n));
}

// 검색 자동완성 API 조회. ISBN 으로 부르면 결과가 1건으로 떨어져서 가장 정확하다.
async function lookupBySearchApi(keyword) {
  if (!keyword) return null;
  const txt = await fetchText(
    `https://search.kyobobook.co.kr/srp/api/v1/search/autocomplete/shop?keyword=${encodeURIComponent(keyword)}`
  );
  const json = parseJsonLoose(txt);
  const docs = json?.data?.resultDocuments || json?.resultDocuments || [];
  log("검색 API 결과:", docs.length, "건 (keyword:", keyword + ")");
  if (!docs.length) return null;

  const d = docs[0];
  const out = {
    isbn: d.CMDTCODE || "",
    title: d.CMDT_NAME || "",
    cmdtId: d.SALE_CMDTID || "",
    category: "",
    authors: [],
    publisher: "",
    year: "",
    month: "",
    blurb: "",
  };

  // "ISBN$@카테고리$@제목$@저자$@출판사$@연$@월$@정가$@..." 형태
  const f = String(d.TOT_RELATE_HTML_LIST || d.RELATE_HTML_LIST || "").split("$@");
  if (f.length >= 7 && /^\d{13}$/.test((f[0] || "").trim())) {
    out.category = (f[1] || "").trim();
    if (!out.title) out.title = (f[2] || "").trim();
    out.authors = splitAuthors(f[3]);
    out.publisher = (f[4] || "").trim();
    out.year = (f[5] || "").trim();
    out.month = (f[6] || "").trim();
    const blurb = (f[21] || "").trim();
    if (blurb && blurb !== "0") out.blurb = blurb;
    log("필드 파싱 성공:", out.authors, "/", out.publisher, "/", out.category);
  } else {
    log("필드 포맷이 예상과 다름. 앞 8개:", f.slice(0, 8));
    // 포맷이 바뀐 경우 이름 기반 필드로 재시도
    out.authors = splitAuthors(d.AUTR_NAME || d.autrName || d.ART_NAME || "");
    out.publisher = d.PBCM_NAME || d.pbcmName || "";
  }
  return out;
}

async function get_kyobobook_info(tp, url, status = "읽는 중", authorHint = "") {
  if (!url) {
    alert("유효한 도서 URL이 없습니다.");
    return "";
  }

  // ---------- 1. URL / 상품코드 정규화 ----------
  let cleanUrl = "";
  if (typeof url === "string") {
    const m = url.match(/https?:\/\/product\.kyobobook\.co\.kr\/detail\/[A-Za-z0-9_-]+/i);
    if (m) cleanUrl = m[0];
    else {
      const code = url.match(/S[0-9]{12}|[0-9]{13}/);
      cleanUrl = code
        ? `https://product.kyobobook.co.kr/detail/${code[0]}`
        : url.trim().split("\n")[0];
    }
  }
  if (!cleanUrl || !cleanUrl.startsWith("http")) {
    cleanUrl = `https://product.kyobobook.co.kr/detail/${String(cleanUrl).replace(/^\//, "")}`;
  }
  log("대상:", cleanUrl);

  // ---------- 2. 상세 HTML ----------
  const response = await fetchText(cleanUrl, {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
  });
  if (!response) {
    alert(`도서 상세 정보를 가져오지 못했습니다.\nURL: ${cleanUrl}`);
    return "";
  }
  log("HTML 길이:", response.length);

  const doc = new DOMParser().parseFromString(response, "text/html");
  const getMeta = (sel) => {
    const el = doc.querySelector(sel);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };
  const getText = (sel) => {
    const el = doc.querySelector(sel);
    return el ? el.textContent.trim() : "";
  };

  const coverImg =
    getMeta('meta[property="og:image"]') || getMeta('meta[name="twitter:image"]') || "";

  // 표지 URL 안에 ISBN 이 있다: .../pdt/9788934972464.jpg?t=...
  let isbn = (coverImg.match(/\/(\d{13})\./) || [])[1] || "";
  if (!isbn) isbn = (response.match(/(\d{13})\.jpg/) || [])[1] || "";

  let title =
    (getMeta('meta[property="og:image:alt"]') || "").trim() ||
    getMeta('meta[property="og:title"]')
      .split("|")[0]
      .replace(/\s*-\s*교보(문고|ebook).*/i, "")
      .trim() ||
    "제목 없음";

  log("제목:", title, "/ ISBN:", isbn || "(못 찾음)");

  // ---------- 3. 검색 API 로 저자·출판사·카테고리 ----------
  let info = null;
  if (isbn) info = await lookupBySearchApi(isbn);
  if ((!info || !info.authors.length) && title && title !== "제목 없음") {
    log("ISBN 조회 실패/저자 없음 -> 제목으로 재시도");
    const byTitle = await lookupBySearchApi(title);
    if (byTitle && byTitle.authors.length) info = byTitle;
  }

  let authors = info ? info.authors.slice() : [];
  if (!authors.length && authorHint) authors = splitAuthors(authorHint);

  if (!authors.length && DEBUG) {
    console.log("=== 저자 수집 실패 ===");
    console.log("isbn:", isbn, "/ title:", title, "/ info:", info);
  }

  const publisher = info?.publisher || "";
  if (info?.title) title = info.title;

  // ---------- 4. 출간일 ----------
  let publishDate = "";
  const dm =
    response.match(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일/) || response.match(/\d{4}\.\d{2}\.\d{2}/);
  if (dm) publishDate = dm[0];
  if (!publishDate && info?.year) {
    publishDate = info.month ? `${info.year}년 ${info.month}월` : info.year;
  }

  // ---------- 5. 카테고리 ----------
  let category = info?.category || "";
  if (!category) {
    const ignore = ["국내도서", "외국도서", "eBook", "홈", "전체", "도서", ""];
    const cats = Array.from(
      doc.querySelectorAll(".btn_sub_category, .btn_category, .breadcrumb_item, a[href*='/category/']")
    )
      .map((el) => el.textContent.replace(/^>\s*/, "").trim())
      .filter((t) => t && !ignore.includes(t));
    category = cats[0] || "독서";
  }

  // ---------- 6. 쪽수 / 목차 ----------
  // 쪽수는 상세 HTML 에도 검색 API 에도 없다. 잡히면 줍고, 없으면 비워둔다.
  let pages = "";
  const pm = response.match(/(\d{2,4})\s*쪽/);
  if (pm) pages = `${pm[1]}쪽`;

  const toc = getText("#contents_02 .product_detail_area") || getText(".toc") || "";

  // ---------- 7. 출력 ----------
  const today = new Date().toISOString().split("T")[0];
  const startDate = status === "읽고 싶은 책" ? "" : today;
  const endDate = status === "완독" ? today : "";
  const categoryTag = (category || "독서").replace(/[\s\/]/g, "");

  const authorsFormatted = authors.length
    ? authors.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(", ")
    : `"저자 미상"`;
  const mainAuthor = authors[0] || "";
  const fullTitle = `(Book) ${title}${mainAuthor ? " - " + mainAuthor : ""}`;

  log("최종:", { authors, publisher, category, publishDate, pages, isbn });

  try {
    await tp.file.rename(title.replace(/[\\/:*?"<>|]/g, ""));
  } catch (err) {
    log("파일명 변경 패스", err);
  }

  return `---
date create: ${today}
tags:
  - book
  - ${categoryTag}
book title: "${title.replace(/"/g, '\\"')}"
authors: [${authorsFormatted}]
publisher: "${publisher}"
status: "${status}"
start date: ${startDate}
end date: ${endDate}
rating: 3.0
cover: "${coverImg}"
category: "${category}"
publish date: "${publishDate}"
pages: "${pages}"
isbn: "${isbn}"
title: "${fullTitle}"
aliases:
  - "${fullTitle}"
url: "${cleanUrl}"
---

## ✍️ 독서 기록 & 인사이트

> [!quote] 📌 인상 깊은 문장
> 

- **핵심 요약:** 
- **내 생각:** 

---

${toc ? `## 📝 목차\n${toc}` : ""}
`;
}

module.exports = get_kyobobook_info;