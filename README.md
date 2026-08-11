# 📚 Obsidian Kyobo Book Scraper & Dashboard

교보문고에서 도서 정보를 검색하여 메타데이터와 목차를 자동으로 수집하고, 독서 상태별로 대시보드 및 카드로 관리할 수 있는 옵시디언(Obsidian) 워크플로우입니다.

---

## ✨ 주요 기능

- **교보문고 도서 검색 & 자동 수집**: 책 제목 검색 또는 교보문고 URL 직접 입력 지원
- **독서 상태 분류**: `📖 읽는 중`, `🎉 완독`, `📌 읽고 싶은 책` 3단계 팝업 선택
- **자동 파일명 & 프론트매터 생성**: 도서 정보(제목, 저자, 독서 시작/완독일, 평점, 표지, 카테고리, 목차 등) 수집
- **시각화 대시보드**: Dataview 플러그인 기반의 그리드 카드형 대시보드 자동 집계
- **그래프 뷰 연동**: 대표 카테고리 태그(`#book`, `#인문` 등) 중심의 지식 연결망 구축

---

## 📂 폴더 구조

```text
📁 Vault
├── 📁 독서
│   ├── 📄 📚 독서 대시보드.md
│   └── 📁 책목록
│       └── 📄 (자동 생성되는 책 노트들).md
└── 📁 Scripts
    ├── 📄 tr_search_kyobobook.js
    └── 📄 tr_get_kyobobook_info.js
```

---

## ⚙️ 사전 준비사항 (필수 플러그인)

1. **Templater**
   - Options -> User Scripts folder: `Scripts` 폴더 지정
   - Template folder location 지정
2. **Dataview**
   - Options -> `Enable JavaScript Queries` 및 `Enable Inline JavaScript Queries` 활성화
3. **Minimal Theme** (권장) 및 **Minimal Theme Settings**
   - Cards View 스타일 지원

---

## 🚀 사용 방법

1. `독서/책목록` 폴더에서 새 노트 생성 (`Cmd + N`)
2. `Cmd + P` 실행 후 `Templater: Open Insert Template modal` 선택
3. `(Tr) 교보문고 검색` 템플릿 실행
4. **팝업 진행**:
   - 1단계: 검색할 책 제목 또는 교보문고 상세 URL 입력
   - 2단계: 독서 상태 선택 (`읽는 중` / `완독` / `읽고 싶은 책`)
   - 3단계: 검색된 도서 목록 중 원하는 항목 클릭
5. **완성**: 노드가 자동 생성되고 `📚 독서 대시보드`에 즉시 반영됨

---

## 🔗 URL 직접 입력 기능 활용법

검색 팝업에서 제목을 찾아도 나오지 않거나, 특정 도서 페이지를 바로 등록하고 싶을 때는 **교보문고 상세 URL을 직접 입력**할 수 있습니다.

1. 웹 브라우저에서 원하는 교보문고 도서 상세 페이지로 이동합니다.
   - 예시 URL: `https://product.kyobobook.co.kr/detail/S000219237619`
2. 주소창의 URL을 복사(`Cmd + C`)합니다.
3. 옵시디언에서 템플릿 실행 시 나오는 **첫 번째 입력창**에 복사한 URL을 그대로 붙여넣습니다.
4. 독서 상태(`읽는 중` / `완독` / `읽고 싶은 책`)를 선택하면 검색 과정을 건너뛰고 해당 도서 정보가 즉시 수집 및 생성됩니다.

---

## 👁️ 결과물 및 카드 뷰 확인 방법

1. **읽기 모드(Reading View) 전환**
   - Dataview 스크립트는 **읽기 모드 (`Cmd + E`)**에서 시각화 카드로 렌더링됩니다.
2. **Minimal Theme Cards 설정 (권장)**
   - Minimal Theme 사용 시 대시보드 프론트매터의 `cssclasses: [cards, cards-cover]` 속성에 의해 자동으로 깔끔한 책장 스타일의 카드로 표시됩니다.

---

## 📊 대시보드 코드 (`📚 독서 대시보드.md`)

````markdown
---
cssclasses:
  - cards
  - cards-cover
  - cards-2-3
---

# 📚 독서 대시보드

---

## 📖 지금 읽는 중인 책
```dataview
TABLE WITHOUT ID
  ("![](" + cover + ")") AS "표지",
  file.link AS "제목",
  category AS "카테고리",
  join(authors, ", ") AS "저자"
FROM #book
WHERE status = "읽는 중"
```

---

## 🎉 완독한 책
```dataview
TABLE WITHOUT ID
  ("![](" + cover + ")") AS "표지",
  file.link AS "제목",
  category AS "카테고리",
  padright("", default(rating, 0), "⭐") AS "평점"
FROM #book
WHERE status = "완독"
SORT row["date create"] DESC
```

---

## 📌 읽고 싶은 책
```dataview
TABLE WITHOUT ID
  ("![](" + cover + ")") AS "표지",
  file.link AS "제목",
  category AS "카테고리"
FROM #book
WHERE status = "읽고 싶은 책"
```
````
