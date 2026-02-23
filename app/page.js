"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const COLUMNS = [
  "DB",
  "DB Object ID",
  "DB Object Symbol",
  "Relation",
  "GO ID",
  "GO Term",
  "Reference",
  "Evidence Code",
  "With (or) From",
  "Aspect",
  "DB Object Name",
  "DB Object Synonym",
  "DB Object Type",
  "Taxon",
  "Date",
  "Assigned By",
  "Annotation Extension",
  "Gene Product Form ID",
];

const DEFAULT_COL_WIDTH = 180;
const MIN_COL_WIDTH = 90;

// ✅ 한 페이지 100개
const PAGE_SIZE = 100;

const ROW_HEIGHT = 38;

// 다운로드 (검색 결과 전체)
const DOWNLOAD_BATCH = 1000;

function escapeCsvValue(v) {
  const s = (v ?? "").toString();
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows, columns) {
  const header = columns.map(escapeCsvValue).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvValue(row?.[c])).join(","));
  return [header, ...lines].join("\n");
}

export default function Page() {
  const [rows, setRows] = useState([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [colFilters, setColFilters] = useState({});
  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState("");

  const [totalCount, setTotalCount] = useState(0);
  const totalPages = useMemo(
    () => (totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 1),
    [totalCount]
  );

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [sortColumn, setSortColumn] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");

  const [colWidths, setColWidths] = useState({});

  // ✅ 헤더/바디 가로스크롤 동기화용 ref
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, globalSearch, sortColumn, sortOrder, colFilters]);

  const hasAnyFilter = () => {
    if (globalSearch.trim() !== "") return true;
    return Object.values(colFilters).some((v) => (v || "").trim() !== "");
  };

  const applyFiltersAndSort = (q) => {
    if (globalSearch.trim() !== "") {
      q = q.ilike("search_text", `%${globalSearch}%`);
    }

    for (const [col, val] of Object.entries(colFilters)) {
      if (val && val.trim() !== "") {
        q = q.ilike(col, `%${val}%`);
      }
    }

    // 정렬은 필터/검색 있을 때만
    if (sortColumn && hasAnyFilter()) {
      q = q.order(sortColumn, { ascending: sortOrder === "asc" });
    }

    return q;
  };

  const fetchData = async () => {
    setLoading(true);

    let q = supabase.from("excel_data_search").select("*", { count: "planned" });
    q = applyFiltersAndSort(q);
    q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    const { data, error, count } = await q;

    if (error) {
      console.error(error);
      setRows([]);
      setTotalCount(0);
    } else {
      setRows(data || []);
      setTotalCount(count ?? 0);
    }

    setLoading(false);
  };

const downloadFiltered = async () => {
  try {
    setDownloading(true);

    let all = [];
    let from = 0;

    while (true) {
      // ✅ 컬럼명 파싱 이슈 피하려고 select("*") 사용
      let q = supabase.from("excel_data_search").select("*");

      q = applyFiltersAndSort(q);
      q = q.range(from, from + DOWNLOAD_BATCH - 1);

      const { data, error } = await q;
      if (error) throw error;

      const chunk = data || [];
      all.push(...chunk);

      if (chunk.length < DOWNLOAD_BATCH) break;
      from += DOWNLOAD_BATCH;

      if (all.length > 200000) {
        alert("다운로드 데이터가 너무 커서(200,000행 초과) 중단했습니다. 조건을 더 좁혀주세요.");
        break;
      }
    }

    if (all.length === 0) {
      alert("다운로드할 결과가 없습니다.");
      return;
    }

    // ✅ CSV는 COLUMNS 기준으로만 뽑아줌
    const csv = toCSV(all, COLUMNS);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `excel_search_result_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert("다운로드 중 오류가 발생했습니다. 콘솔을 확인해 주세요.");
  } finally {
    setDownloading(false);
  }
};

  const handleSort = (col) => {
    setPage(0);
    if (sortColumn === col) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortOrder("asc");
    }
  };

  const setFilter = (col, value) => {
    setPage(0);
    setColFilters((prev) => ({ ...prev, [col]: value }));
  };

  // ✅ 컬럼 리사이즈 (헤더에서도 동작)
  const initResize = (e, col) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[col] ?? DEFAULT_COL_WIDTH;

    const onMove = (ev) => {
      const w = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
      setColWidths((prev) => ({ ...prev, [col]: w }));
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const goToPage = () => {
    const n = parseInt(pageInput, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      setPage(n - 1);
    }
    setPageInput("");
  };

  // ✅ 헤더 <-> 바디 가로 스크롤 동기화
  const syncScroll = (src) => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    const headerEl = headerScrollRef.current;
    const bodyEl = bodyScrollRef.current;

    if (!headerEl || !bodyEl) {
      syncingRef.current = false;
      return;
    }

    if (src === "body") headerEl.scrollLeft = bodyEl.scrollLeft;
    if (src === "header") bodyEl.scrollLeft = headerEl.scrollLeft;

    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <style jsx>{`
        table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
        }
        th,
        td {
          border-bottom: 1px solid #e6e6e6;
          border-right: 1px solid #f0f0f0;
          padding: 6px 8px;
          vertical-align: middle;
        }
        th:last-child,
        td:last-child {
          border-right: none;
        }

        /* ✅ sticky 헤더 영역 (컬럼명만) */
        .stickyHeaderWrap {
          position: sticky;
          top: 0;
          z-index: 50;
          background: #e9eef3;
          /* 아래쪽 경계선/그림자 */
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
        }

        .headerTable th {
          background: #e9eef3;
          color: #111;
          font-weight: 700;
          height: 38px;
        }

        .headCell {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          user-select: none;
          cursor: pointer;
          padding-right: 6px; /* resizer 공간 */
        }

        .headTitle {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: calc(100% - 24px);
        }

        .sortBadge {
          font-size: 12px;
          opacity: 0.9;
          flex: 0 0 auto;
        }

        .resizer {
          position: absolute;
          right: 0;
          top: 0;
          height: 100%;
          width: 8px;
          cursor: col-resize;
          user-select: none;
        }
        .resizer:hover {
          background: rgba(0, 0, 0, 0.06);
        }

        .filterRow th {
          background: #f6f8fa;
          height: 42px;
        }

        .filterInput {
          width: 100%;
          padding: 6px 8px;
          font-size: 12px;
          border: 1px solid #cfd8e3;
          border-radius: 8px;
          background: #fff;
          color: #111;
        }
        .filterInput::placeholder {
          color: #7b8794;
        }

        .cell {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          height: ${ROW_HEIGHT}px;
          line-height: ${ROW_HEIGHT - 12}px;
        }

        /* ✅ 헤더/바디 둘 다 가로스크롤 */
        .hScroll {
          overflow-x: auto;
          overflow-y: visible;
        }
      `}</style>

      <h2 style={{ marginBottom: 12 }}>Excel Data Viewer</h2>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <input
          type="text"
          placeholder="전체 검색 (부분 문자열)…"
          value={globalSearch}
          onChange={(e) => {
            setGlobalSearch(e.target.value);
            setPage(0);
          }}
          style={{
            padding: 8,
            width: 320,
            borderRadius: 8,
            border: "1px solid #cfd8e3",
          }}
        />

        <button
          onClick={() => {
            setGlobalSearch("");
            setColFilters({});
            setSortColumn(null);
            setSortOrder("asc");
            setPage(0);
          }}
          style={{ padding: "8px 10px" }}
        >
          조건 초기화
        </button>

        <button onClick={downloadFiltered} disabled={downloading} style={{ padding: "8px 10px" }}>
          {downloading ? "다운로드 중..." : "검색 결과 다운로드(CSV)"}
        </button>

        {loading && <span style={{ fontSize: 13 }}>Loading…</span>}
      </div>

      {/* ✅ 1) 컬럼명만 sticky로 고정되는 헤더 영역 */}
      <div className="stickyHeaderWrap">
        <div
          className="hScroll"
          ref={headerScrollRef}
          onScroll={() => syncScroll("header")}
        >
          <table className="headerTable">
            <thead>
              <tr>
                {COLUMNS.map((col) => {
                  const w = colWidths[col] ?? DEFAULT_COL_WIDTH;
                  const isSorted = sortColumn === col;
                  const arrow = isSorted ? (sortOrder === "asc" ? "▲" : "▼") : "";

                  return (
                    <th key={col} style={{ width: w, minWidth: MIN_COL_WIDTH }}>
                      <div className="headCell" onClick={() => handleSort(col)}>
                        <span className="headTitle" title={col}>
                          {col}
                        </span>
                        <span className="sortBadge">{arrow}</span>
                        <div className="resizer" onMouseDown={(e) => initResize(e, col)} />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      {/* ✅ 2) 본문 영역: 여기서만 필터 input이 나오고(스크롤하면 사라짐), 가로 스크롤은 헤더와 동기화 */}
      <div
        className="hScroll"
        ref={bodyScrollRef}
        onScroll={() => syncScroll("body")}
      >
        <table>
          <thead>
            {/* 필터 줄은 sticky 아님 → 스크롤하면 위로 사라짐 */}
            <tr className="filterRow">
              {COLUMNS.map((col) => {
                const w = colWidths[col] ?? DEFAULT_COL_WIDTH;
                return (
                  <th key={col} style={{ width: w, minWidth: MIN_COL_WIDTH }}>
                    <input
                      className="filterInput"
                      placeholder="컬럼 검색"
                      value={colFilters[col] ?? ""}
                      onChange={(e) => setFilter(col, e.target.value)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} style={{ height: ROW_HEIGHT }}>
                {COLUMNS.map((col) => {
                  const w = colWidths[col] ?? DEFAULT_COL_WIDTH;
                  const val = row[col];

                  return (
                    <td key={col} style={{ width: w, minWidth: MIN_COL_WIDTH }}>
                      <div className="cell" title={val ?? ""}>
                        {val ?? ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{ padding: 16, color: "#666" }}>
                  결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지 컨트롤 */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          이전
        </button>

        <span style={{ fontSize: 13 }}>
          {page + 1} / {totalPages}
        </span>

        <button
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        >
          다음
        </button>

        <input
          type="number"
          placeholder="페이지"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToPage();
          }}
          style={{
            width: 90,
            padding: 6,
            borderRadius: 8,
            border: "1px solid #cfd8e3",
          }}
          min={1}
          max={totalPages}
        />

        <button onClick={goToPage}>이동</button>
      </div>

      <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>
        팁: 정렬은 대용량에서 부담이 커서(타임아웃 방지) 검색/필터가 있을 때만 적용됩니다.
      </div>
    </div>
  );
}
