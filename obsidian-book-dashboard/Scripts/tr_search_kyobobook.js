async function search_kyobobook(tp) {
  // 1. 책 제목 또는 URL 입력 팝업
  let defaultTitle =
    tp.file.title.includes("Untitled") || tp.file.title.includes("무제")
      ? ""
      : tp.file.title;
  let input = await tp.system.prompt(
    "검색할 책 제목 또는 교보문고 URL을 입력하세요:",
    defaultTitle
  );
  if (!input) return "";

  input = input.trim();

  // [방식 1] 사용자가 첫 입력창에 URL을 직접 붙여넣은 경우
  if (input.startsWith("http://") || input.startsWith("https://") || input.includes("kyobobook.co.kr")) {
    let status = await tp.system.suggester(
      ["📖 읽는 중", "🎉 완독", "📌 읽고 싶은 책"],
      ["읽는 중", "완독", "읽고 싶은 책"]
    );
    if (!status) status = "읽는 중";

    const get_info = require(app.vault.adapter.getBasePath() +
      "/Scripts/tr_get_kyobobook_info.js");
    return await get_info(tp, input, status);
  }

  // 2. 검색어인 경우 독서 상태 선택 팝업
  let status = await tp.system.suggester(
    ["📖 읽는 중", "🎉 완독", "📌 읽고 싶은 책"],
    ["읽는 중", "완독", "읽고 싶은 책"]
  );
  if (!status) status = "읽는 중";

  let bookOptions = [];
  let bookUrls = [];

  // 3. 교보문고 검색 API (JSON) 호출
  try {
    let apiUrl = `https://search.kyobobook.co.kr/srp/api/v1/search/autocomplete/shop?keyword=${encodeURIComponent(
      input
    )}`;
    let apiRes = await request({ url: apiUrl });

    let cleanJson = apiRes.trim();
    if (cleanJson.startsWith("autocompleteShop(")) {
      cleanJson = cleanJson
        .replace(/^autocompleteShop\(/, "")
        .replace(/\);?$/, "");
    }

    let data = JSON.parse(cleanJson);
    let docs = data?.data?.resultDocuments || data?.resultDocuments || [];

    docs.forEach((doc) => {
      let cmdtId =
        doc.SALE_CMDTID ||
        doc.saleCmdtid ||
        doc.CMDTCODE ||
        doc.cmdtCode ||
        doc.BARCODE;
      let title =
        doc.CMDT_NAME || doc.cmdtName || doc.TITLE_NAME || doc.titleName;
      let author = doc.AUTR_NAME || doc.autrName || doc.ART_NAME || "";
      let publisher = doc.PBCM_NAME || doc.pbcmName || "";

      if (cmdtId && title) {
        let cmdtStr = String(cmdtId).trim();
        let url = cmdtStr.startsWith("http")
          ? cmdtStr
          : `https://product.kyobobook.co.kr/detail/${cmdtStr}`;

        let label = `${title} ${author ? "(" + author + ")" : ""} ${
          publisher ? "[" + publisher + "]" : ""
        }`;
        bookOptions.push(label);
        bookUrls.push(url);
      }
    });
  } catch (e) {
    console.log("JSON API 검색 중 에러 발생:", e);
  }

  // 4. API 실패 시 HTML 파싱 Fallback
  if (bookOptions.length === 0) {
    try {
      let searchUrl = `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(
        input
      )}&target=total&gbCode=TOT`;
      let response = await request({ url: searchUrl });
      const parser = new DOMParser();
      const doc = parser.parseFromString(response, "text/html");
      const items = doc.querySelectorAll(".prod_item, .prod_area");

      items.forEach((item) => {
        let titleEl =
          item.querySelector(".prod_name") || item.querySelector(".title");
        let authorEl =
          item.querySelector(".prod_author") || item.querySelector(".author");
        let linkEl = item.querySelector("a[href*='/detail/']");

        if (titleEl && linkEl) {
          let title = titleEl.innerText.trim();
          let author = authorEl ? authorEl.innerText.trim() : "";
          let rawHref = linkEl.getAttribute("href") || "";

          let url = "";
          if (rawHref.startsWith("http")) {
            url = rawHref;
          } else if (rawHref.startsWith("/")) {
            url = `https://product.kyobobook.co.kr${rawHref}`;
          } else if (rawHref) {
            url = `https://product.kyobobook.co.kr/detail/${rawHref}`;
          }

          if (url) {
            bookOptions.push(`${title} ${author ? "(" + author + ")" : ""}`);
            bookUrls.push(url);
          }
        }
      });
    } catch (e) {
      console.log("HTML 파싱 시도 실패:", e);
    }
  }

  // [방식 2] 검색 결과가 없을 때 URL 직접 입력 받기
  if (bookOptions.length === 0) {
    let fallbackUrl = await tp.system.prompt(
      "검색 결과가 없습니다. 교보문고 도서 상세 URL을 직접 입력해 주세요:"
    );
    if (fallbackUrl && fallbackUrl.trim()) {
      const get_info = require(app.vault.adapter.getBasePath() +
        "/Scripts/tr_get_kyobobook_info.js");
      return await get_info(tp, fallbackUrl.trim(), status);
    }
    return "";
  }

  // 5. 검색 목록 선택 팝업
  let selectedIndex = await tp.system.suggester(
    bookOptions,
    Array.from(Array(bookOptions.length).keys())
  );
  if (selectedIndex === null || selectedIndex === undefined) return "";

  let selectedUrl = String(bookUrls[selectedIndex]).trim();

  // 6. 상세 정보 수집 함수 호출
  const get_info = require(app.vault.adapter.getBasePath() +
    "/Scripts/tr_get_kyobobook_info.js");
  let content = await get_info(tp, selectedUrl, status);

  return content;
}

module.exports = search_kyobobook;