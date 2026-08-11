<%_*
let url = tp.frontmatter["url"];

// 메타 데이터에 url이 있으면 검색 없이 바로 책 정보 가져옴.
// 메타 데이터에 url이 없으면 검색.
if(!url) {
  // 메타 데이터에서 book title과 authors를 가져 온다.
  const title = tp.frontmatter["book title"]? tp.frontmatter["book title"]: "";
  const authors = tp.frontmatter["authors"]? tp.frontmatter["authors"]: [];
  console.log(title);
  console.log(authors);

  // 저자 정보를 문자로 바꾸기
  let authors_str = "";
  if(typeof authors == "string") {
    authors_str = authors;
  }
  else if(authors instanceof Array) {
    authors_str = authors.join(" ");
  }
  else {
    for(let key in authors) {
      if(typeof authors[key] == "string") {
        authors_str += " " + authors[key];
      }
      else if(authors[key] instanceof Array) {
        authors_str += " " + authors[key].join(" ");
      }
    }
  }

  // 검색하여 책 정보 주소를 가져온다.
  try {
  url = await tp.user.tr_search_kyobobook(tp, title, authors_str);
  }
  catch(e) {
    console.log(e);
  }
}

console.log("url:", url);

if(url) {
  // 책 정보 가져옴.
  tR = await tp.user.tr_get_kyobobook_info(tp, url);
  if(tR == "") {
    return;
  }
}
else {
  return;
}
_%>