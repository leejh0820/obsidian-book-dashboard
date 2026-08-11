async function get_kyobobook_info(tp, url, status = "읽는 중") {
  if (!url) {
    alert("유효한 도서 URL이 없습니다.");
    return "";
  }

  // 1. URL 정밀 정규화
  let cleanUrl = "";
  if (typeof url === "string") {
    let matchUrl = url.match(/https?:\/\/product\.kyobobook\.co\.kr\/detail\/[A-Za-z0-9_-]+/i);
    if (matchUrl) {
      cleanUrl = matchUrl[0];
    } else {
      let matchCode = url.match(/S[0-9]{12}|[0-9]{13}/);
      if (matchCode) {
        cleanUrl = `https://product.kyobobook.co.kr/detail/${matchCode[0]}`;
      } else {
        cleanUrl = url.trim().split("\n")[0];
      }
    }
  }

  if (!cleanUrl || !cleanUrl.startsWith("http")) {
    cleanUrl = `https://product.kyobobook.co.kr/detail/${cleanUrl.replace(/^\//, '')}`;
  }

  let response;
  try {
    response = await request({ url: cleanUrl });
  } catch (e) {
    console.log("에러 발생 - request", e);
    alert(`도서 상세 정보를 가져오는 중 에러가 발생했습니다.\nURL: ${cleanUrl}\nError: ${e}`);
    return "";
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(response, "text/html");

  const getMeta = (selector) => {
    const el = doc.querySelector(selector);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };

  const getText = (selector) => {
    const el = doc.querySelector(selector);
    return el ? el.innerText.trim() : "";
  };

  // 2. 저자 정밀 수집 (번역가 오차 방지)
  let authors = [];

  // (1단계) JSON-LD 데이터 (표준 원작자 데이터)
  try {
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent);
        const bookData = Array.isArray(data) ? data.find(item => item["@type"] === "Book") : (data["@type"] === "Book" ? data : null);
        if (bookData && bookData.author) {
          let authorArr = Array.isArray(bookData.author) ? bookData.author : [bookData.author];
          authorArr.forEach(a => {
            let name = typeof a === "object" ? a.name : a;
            if (name && typeof name === "string") {
              name = name.trim();
              if (name && !authors.includes(name)) authors.push(name);
            }
          });
        }
      } catch(err) {}
    });
  } catch (e) {}

  // (2단계) 교보문고 JSON 키 정규식 탐색 (autrNm, autrName, wrtNm, artNm 등)
  if (authors.length === 0) {
    const authorRegexes = [
      /"autrNm"\s*:\s*"([^"]+)"/g,
      /"autrName"\s*:\s*"([^"]+)"/g,
      /"wrtNm"\s*:\s*"([^"]+)"/g,
      /"artNm"\s*:\s*"([^"]+)"/g,
      /"chrrName"\s*:\s*"([^"]+)"/g,
      /"personNm"\s*:\s*"([^"]+)"/g
    ];

    authorRegexes.forEach(re => {
      let matches = [...response.matchAll(re)];
      matches.forEach(m => {
        if (m[1]) {
          let name = m[1].replace(/\\"/g, '"').trim();
          if (name && !authors.includes(name) && name.length < 50 && !/옮긴이|번역|역자|감수/.test(name)) {
            authors.push(name);
          }
        }
      });
    });
  }

  // (3단계) DOM 요소 탐색
  if (authors.length === 0) {
    let authorEls = doc.querySelectorAll(".author_sub .author_name, .prod_author_box .author, .author_name, .prod_author a, .author_list .name");
    authorEls.forEach((el) => {
      let name = el.innerText.trim();
      
      // 바로 옆 텍스트나 본인 태그에 '옮긴이', '역자' 표기가 있는지 확인
      let isTrans = false;
      let nextText = el.nextSibling ? el.nextSibling.textContent : "";
      let prevText = el.previousSibling ? el.previousSibling.textContent : "";
      
      if (/옮긴이|역자|번역|감수/.test(name) || /옮긴이|역자|번역|감수/.test(nextText) || /옮긴이|역자|번역|감수/.test(prevText)) {
        isTrans = true;
      }

      name = name.replace(/\((지은이|글|그림|저|원작)\)/g, "").trim();

      if (name && !isTrans && !authors.includes(name) && name.length < 50 && !/옮긴이|번역|역자|감수/.test(name)) {
        authors.push(name);
      }
    });
  }

  // (4단계) og:title 파싱 (최후의 보루)
  let rawTitle = getMeta('meta[property="og:title"]') || getText(".prod_title") || "제목 없음";
  let title = rawTitle;
  let extractedAuthorFromTitle = "";

  if (rawTitle.includes("|")) {
    let parts = rawTitle.split("|");
    title = parts[0].trim();
    if (parts[1]) {
      extractedAuthorFromTitle = parts[1].replace(/\s*-\s*교보문고.*/, "").trim();
    }
  } else if (rawTitle.includes(" - ")) {
    let parts = rawTitle.split(" - ");
    title = parts[0].trim();
    if (parts.length >= 3 && parts[1].trim() !== "교보문고") {
      extractedAuthorFromTitle = parts[1].trim();
    }
  } else {
    title = rawTitle.replace(/\s*-\s*교보문고.*/, "").trim();
  }

  if (authors.length === 0) {
    if (extractedAuthorFromTitle && !/옮긴이|번역|역자|감수/.test(extractedAuthorFromTitle)) {
      authors = [extractedAuthorFromTitle];
    } else {
      let authorMeta = getMeta('meta[name="author"]') || getMeta('meta[property="og:author"]');
      if (authorMeta && !/옮긴이|번역|역자|감수/.test(authorMeta)) {
        authors = [authorMeta.trim()];
      }
    }
  }

  // 3. 출간일 (Publish Date) 수집
  let publishDate = "";
  let dateEl = doc.querySelector(".prod_publish .date, .publish_date, .date");
  if (dateEl) {
    publishDate = dateEl.innerText.trim();
  }
  if (!publishDate) {
    let dateMatch = response.match(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일/) || response.match(/\d{4}\.\d{2}\.\d{2}/);
    if (dateMatch) publishDate = dateMatch[0];
  }

  // 4. 대표 카테고리 수집 (상위 2번째 대분류)
  let category = "";
  const ignoreCategories = ["국내도서", "외국도서", "eBook", "홈", "전체", "도서", ""];
  let catElements = Array.from(
    doc.querySelectorAll(".btn_sub_category, .btn_category, .category_list .category_item, .breadcrumb_item, a[href*='/category/']")
  );
  let validCategories = catElements
    .map((el) => el.innerText.replace(/^>\s*/, "").trim())
    .filter((txt) => txt && !ignoreCategories.includes(txt));

  let uniqueCategories = [];
  validCategories.forEach((c) => {
    if (!uniqueCategories.includes(c)) uniqueCategories.push(c);
  });

  if (uniqueCategories.length > 0) {
    category = uniqueCategories[0];
  }
  if (!category) {
    category = getMeta('meta[property="article:section"]') || "독서";
  }

  // 5. 커버 이미지, 페이지 수, 목차 수집
  let coverImg = getMeta('meta[property="og:image"]') || getMeta('meta[name="twitter:image"]') || "";

  let pages = "";
  let pageMatch = response.match(/(\d+)\s*쪽/);
  if (pageMatch) {
    pages = `${pageMatch[1]}쪽`;
  } else {
    pages = getText(".page_num") || "";
  }

  let toc = getText("#contents_02 .product_detail_area") || getText(".toc") || "";

  // 6. 날짜 계산 (YYYY-MM-DD)
  const today = new Date().toISOString().split("T")[0];
  let startDate = status === "읽고 싶은 책" ? "" : today;
  let endDate = status === "완독" ? today : "";

  let categoryTag = category.replace(/[\s\/]/g, "");

  let authorsFormatted =
    authors.length > 0
      ? authors.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(", ")
      : `"저자 미상"`;

  let mainAuthor = authors.length > 0 ? authors[0] : "";
  let fullTitle = `(Book) ${title}${mainAuthor ? " - " + mainAuthor : ""}`;

  try {
    await tp.file.rename(title.replace(/[\\/:*?"<>|]/g, ""));
  } catch (err) {
    console.log("파일명 변경 패스", err);
  }

  // 7. 최종 속성 출력
  let result = `---
date create: ${today}
tags:
  - book
  - ${categoryTag}
book title: "${title.replace(/"/g, '\\"')}"
authors: [${authorsFormatted}]
status: "${status}"
start date: ${startDate}
end date: ${endDate}
rating: 3.0
cover: "${coverImg}"
category: "${category}"
publish date: "${publishDate}"
pages: "${pages}"
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

  return result;
}

module.exports = get_kyobobook_info;