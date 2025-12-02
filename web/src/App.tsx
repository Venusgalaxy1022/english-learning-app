import { useEffect, useMemo, useState } from "react";

type ApiResponseHealth = {
  message: string;
  ok: boolean;
  time: string;
};

type ReadingSession = {
  sessionIndex: number;
  weekIndex: number;
  chapterStart: number;
  chapterEnd: number;
};

type ReadingPlan = {
  ok: boolean;
  plan: {
    bookId: string;
    totalChapters: number;
    sessionsPerWeek: number;
    totalWeeks: number;
    sessions: ReadingSession[];
  };
};

type ProgressSummary = {
  ok: boolean;
  bookId: string;
  trackId: string;
  totalChapters: number;
  completedCount: number;
  completionRate: number;
  lastCompletedSegment: number | null;
};

type CalendarItem = {
  uid?: string;
  date: string;
  totalSegmentsCompleted?: number;
  totalStudyMinutes?: number;
};

type ChapterContentResponse = {
  ok: boolean;
  bookId: string;
  trackId: string;
  segmentIndex: number;
  title: string;
  paragraphs: string[];
  estimatedMinutes: number;
};

const FIREBASE_PROJECT_ID = "english-reading-habit-builder";

const API_BASE =
  import.meta.env.DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1/api`
    : "/api";

const BOOK_ID = "little-women";
const TRACK_ID = "little-women-30";
const SESSIONS_PER_WEEK = 3;

// 브라우저 선택 영역 가져오기
function getSelectionText() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  return selection.toString().trim();
}

function App() {
  const [health, setHealth] = useState<ApiResponseHealth | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [plan, setPlan] = useState<ReadingPlan["plan"] | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 읽기 화면 상태
  const [chapterContent, setChapterContent] =
    useState<ChapterContentResponse | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);

  // 학습 기능 상태
  const [lastSavedWord, setLastSavedWord] = useState<string | null>(null);
  const [lastHighlightText, setLastHighlightText] = useState<string | null>(
    null
  );
  const [noteText, setNoteText] = useState("");
  const [isNoteSaving, setIsNoteSaving] = useState(false);

  const todayMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, []);

  // 초기 로딩
  useEffect(() => {
    // API 헬스 체크
    fetch(API_BASE)
      .then((res) => res.json())
      .then((json: ApiResponseHealth) => setHealth(json))
      .catch((err) => {
        console.error(err);
        setHealth(null);
      });

    reloadSummary();
    reloadCalendar();
    reloadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadSummary = () => {
    setError(null);
    fetch(
      `${API_BASE}/progress/summary?bookId=${encodeURIComponent(
        BOOK_ID
      )}&trackId=${encodeURIComponent(TRACK_ID)}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          setSummary(json as ProgressSummary);
        } else {
          setSummary(null);
          setError(json.error || "진행도 요약을 불러오지 못했습니다.");
        }
      })
      .catch((err) => {
        console.error(err);
        setSummary(null);
        setError("진행도 요약을 불러오지 못했습니다.");
      });
  };

  const reloadCalendar = () => {
    setError(null);
    fetch(
      `${API_BASE}/progress/calendar?month=${encodeURIComponent(todayMonth)}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && Array.isArray(json.items)) {
          setCalendar(json.items as CalendarItem[]);
        } else {
          setCalendar([]);
        }
      })
      .catch((err) => {
        console.error(err);
        setCalendar([]);
      });
  };

  const reloadPlan = () => {
    setError(null);
    fetch(
      `${API_BASE}/reading-plan?bookId=${encodeURIComponent(
        BOOK_ID
      )}&sessionsPerWeek=${SESSIONS_PER_WEEK}`
    )
      .then((res) => res.json())
      .then((json: ReadingPlan) => {
        if (json.ok && json.plan) {
          setPlan(json.plan);
        } else {
          setPlan(null);
          setError("읽기 계획을 불러오지 못했습니다.");
        }
      })
      .catch((err) => {
        console.error(err);
        setPlan(null);
        setError("읽기 계획을 불러오지 못했습니다.");
      });
  };

  // 세그먼트 완료
  const handleCompleteSegment = async (segmentIndex: number) => {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/progress/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user"
        },
        body: JSON.stringify({
          bookId: BOOK_ID,
          trackId: TRACK_ID,
          segmentIndex,
          timeSpentMinutes: 20
        })
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "완료 처리에 실패했습니다.");
        return;
      }
      reloadSummary();
      reloadCalendar();
    } catch (e) {
      console.error(e);
      setError("완료 처리 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  // 본문 불러오기 + 해당 세그먼트의 노트도 같이 불러오기
  const loadContentForSegment = async (segmentIndex: number) => {
    setError(null);
    setIsContentLoading(true);
    setChapterContent(null);
    setNoteText("");
    try {
      const res = await fetch(
        `${API_BASE}/content?bookId=${encodeURIComponent(
          BOOK_ID
        )}&trackId=${encodeURIComponent(
          TRACK_ID
        )}&segmentIndex=${segmentIndex}`
      );
      const json = (await res.json()) as ChapterContentResponse;
      if (!json.ok) {
        setError("본문을 불러오지 못했습니다.");
        return;
      }
      setChapterContent(json);

      // 인사이트(노트) 불러오기
      const noteRes = await fetch(
        `${API_BASE}/insights?bookId=${encodeURIComponent(
          BOOK_ID
        )}&trackId=${encodeURIComponent(
          TRACK_ID
        )}&segmentIndex=${segmentIndex}`
      );
      const noteJson = await noteRes.json();
      if (noteJson.ok) {
        setNoteText(noteJson.note || "");
      }
    } catch (e) {
      console.error(e);
      setError("본문을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsContentLoading(false);
    }
  };

  const completionPercent =
    summary && summary.totalChapters
      ? Math.round(summary.completionRate * 100)
      : 0;

  const lastCompletedSegment =
    summary?.lastCompletedSegment != null ? summary.lastCompletedSegment : 0;

  // 오늘 읽을 세션
  const nextSession = useMemo(() => {
    if (!plan) return null;
    const totalChapters = plan.totalChapters || 30;
    if (lastCompletedSegment >= totalChapters) return null;

    const nextSegmentIndex = lastCompletedSegment + 1;
    const found = plan.sessions.find(
      (s) =>
        nextSegmentIndex >= s.chapterStart &&
        nextSegmentIndex <= s.chapterEnd
    );
    return found || null;
  }, [plan, lastCompletedSegment]);

  const isPlanCompleted =
    !!plan && lastCompletedSegment >= (plan.totalChapters || 30);

  // ✅ 더블클릭 → 단어 저장
  const handleDoubleClickReader = async () => {
    if (!chapterContent) return;
    const sel = getSelectionText();
    if (!sel) return;

    // 대충 첫 단어 기준으로
    const word = sel.split(/\s+/)[0];
    if (!word) return;

    try {
      const res = await fetch(`${API_BASE}/words`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user"
        },
        body: JSON.stringify({
          bookId: BOOK_ID,
          trackId: TRACK_ID,
          segmentIndex: chapterContent.segmentIndex,
          word,
          contextText: sel
        })
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "단어 저장에 실패했습니다.");
        return;
      }
      setLastSavedWord(word);
    } catch (e) {
      console.error(e);
      setError("단어 저장 중 오류가 발생했습니다.");
    }
  };

  // ✅ 드래그 후 MouseUp → 하이라이트 저장
  const handleMouseUpReader = async () => {
    if (!chapterContent) return;
    const sel = getSelectionText();
    if (!sel) return;
    // 너무 긴 선택은 무시 (예: 100자 이상)
    if (sel.length > 200) return;

    try {
      const res = await fetch(`${API_BASE}/highlights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user"
        },
        body: JSON.stringify({
          bookId: BOOK_ID,
          trackId: TRACK_ID,
          segmentIndex: chapterContent.segmentIndex,
          text: sel,
          color: "yellow"
        })
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "하이라이트 저장에 실패했습니다.");
        return;
      }
      setLastHighlightText(sel);
    } catch (e) {
      console.error(e);
      setError("하이라이트 저장 중 오류가 발생했습니다.");
    }
  };

  // ✅ 인사이트(노트) 저장
  const handleSaveNote = async () => {
    if (!chapterContent) return;
    if (!noteText.trim()) {
      setError("노트 내용이 비어 있습니다.");
      return;
    }
    setIsNoteSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user"
        },
        body: JSON.stringify({
          bookId: BOOK_ID,
          trackId: TRACK_ID,
          segmentIndex: chapterContent.segmentIndex,
          note: noteText
        })
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "노트 저장에 실패했습니다.");
        return;
      }
    } catch (e) {
      console.error(e);
      setError("노트 저장 중 오류가 발생했습니다.");
    } finally {
      setIsNoteSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="max-w-5xl w-full mx-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">english-learning-app</h1>
          <p className="text-sm text-slate-400">
            오늘의 세션 · 읽기 계획 · 진행도 · 캘린더 · 학습 기능 POC
          </p>
        </header>

        {/* API 상태 */}
        <section className="text-xs text-slate-400">
          <div className="font-medium mb-1">API 상태</div>
          {health ? (
            <div className="flex flex-wrap gap-2 items-center">
              <span
                className={`px-2 py-1 rounded-full border text-emerald-200 ${
                  health.ok
                    ? "bg-emerald-900/40 border-emerald-500/40"
                    : "bg-red-900/40 border-red-500/40"
                }`}
              >
                {health.ok ? "OK" : "DOWN"}
              </span>
              <span>{health.message}</span>
              <span className="text-slate-500">
                ({new Date(health.time).toLocaleString()})
              </span>
            </div>
          ) : (
            <div className="text-red-400">
              헬스 체크 실패: Functions 에뮬레이터가 켜져 있는지 확인해 주세요.
            </div>
          )}
        </section>

        {/* 진행도 요약 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm text-slate-200">
                진행도 요약 (책: {BOOK_ID}, 트랙: {TRACK_ID})
              </div>
              <p className="text-xs text-slate-500">
                POC: 30세그먼트 트랙 기준 진행률을 계산합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={reloadSummary}
              className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-900/60 hover:bg-slate-800 transition-colors"
            >
              새로고침
            </button>
          </div>

          <div className="space-y-2">
            <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>
                완료 세그먼트:{" "}
                {summary ? summary.completedCount : 0} /{" "}
                {summary ? summary.totalChapters : 30}
              </span>
              <span>진행률: {completionPercent}%</span>
            </div>
            {summary?.lastCompletedSegment && (
              <p className="text-xs text-slate-500">
                마지막으로 완료한 세그먼트: Day{" "}
                {summary.lastCompletedSegment}
              </p>
            )}
          </div>
        </section>

        {/* 오늘 읽을 세션 */}
        <section className="space-y-2 border border-slate-800 rounded-xl p-4 bg-slate-900/60">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div>
              <div className="font-medium text-sm text-slate-100">
                오늘 읽을 세션
              </div>
              <p className="text-xs text-slate-500">
                진행도를 기준으로 다음에 읽어야 할 세그먼트를 추천합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                reloadSummary();
                reloadPlan();
              }}
              className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-900/60 hover:bg-slate-800 transition-colors"
            >
              새로고침
            </button>
          </div>

          {!plan || !summary ? (
            <p className="text-xs text-slate-500">
              읽기 계획 또는 진행도 정보를 불러오는 중입니다.
            </p>
          ) : isPlanCompleted ? (
            <p className="text-xs text-emerald-300">
              축하합니다! 이 트랙의 모든 세그먼트를 완료했습니다 🎉
            </p>
          ) : !nextSession ? (
            <p className="text-xs text-slate-500">
              다음에 읽을 세션 정보를 찾을 수 없습니다.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <div>
                <div className="text-slate-300">
                  Week {nextSession.weekIndex} · Session{" "}
                  {nextSession.sessionIndex}
                </div>
                <div className="text-slate-400">
                  오늘 읽을 파트: Part {nextSession.chapterStart}
                  {nextSession.chapterStart !== nextSession.chapterEnd &&
                    ` - Part ${nextSession.chapterEnd}`}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    loadContentForSegment(nextSession.chapterStart)
                  }
                  className="inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-[11px] font-medium text-slate-100 hover:bg-slate-800 transition-colors"
                >
                  본문 열기
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleCompleteSegment(nextSession.chapterStart)
                  }
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 px-4 py-2 text-[11px] font-medium text-slate-950 transition-colors"
                >
                  {isSaving
                    ? "오늘 세션 완료 기록 중..."
                    : "오늘 세션을 완료로 기록"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 📖 읽기 화면 + 학습 기능 */}
        <section className="space-y-3 border border-slate-800 rounded-xl p-4 bg-slate-950/70">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div>
              <div className="font-medium text-sm text-slate-100">
                읽기 화면
              </div>
              <p className="text-xs text-slate-500">
                더블클릭: 단어 저장 · 드래그 후 마우스 업: 하이라이트 저장
              </p>
            </div>
          </div>

          {isContentLoading ? (
            <p className="text-xs text-slate-400">본문을 불러오는 중...</p>
          ) : !chapterContent ? (
            <p className="text-xs text-slate-500">
              아직 선택된 세션이 없습니다. 위에서 &quot;본문 열기&quot;를
              눌러보세요.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {chapterContent.title}
                  </div>
                  <p className="text-xs text-slate-500">
                    Book: {chapterContent.bookId} · Segment:{" "}
                    {chapterContent.segmentIndex} · 예상{" "}
                    {chapterContent.estimatedMinutes}분
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCompleteSegment(chapterContent.segmentIndex)
                  }
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 px-4 py-2 text-[11px] font-medium text-slate-950 transition-colors"
                >
                  {isSaving
                    ? "이 세션 완료 기록 중..."
                    : "이 세션을 완료로 기록"}
                </button>
              </div>

              {/* 본문 + 더블클릭/하이라이트 이벤트 */}
              <div
                onDoubleClick={handleDoubleClickReader}
                onMouseUp={handleMouseUpReader}
                className="max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3 space-y-3 text-sm leading-relaxed cursor-text"
              >
                {chapterContent.paragraphs.map((p, idx) => (
                  <p key={idx} className="text-slate-100">
                    {p}
                  </p>
                ))}
              </div>

              {/* 최근 저장 피드백 */}
              <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
                {lastSavedWord && (
                  <span>
                    단어 저장됨:{" "}
                    <span className="text-emerald-300 font-medium">
                      {lastSavedWord}
                    </span>
                  </span>
                )}
                {lastHighlightText && (
                  <span>
                    하이라이트 저장됨:{" "}
                    <span className="text-amber-300">
                      {lastHighlightText.slice(0, 30)}
                      {lastHighlightText.length > 30 ? "..." : ""}
                    </span>
                  </span>
                )}
              </div>

              {/* 인사이트 / 노트 */}
              <div className="space-y-2">
                <div className="text-xs text-slate-300 font-medium">
                  인사이트 / 노트
                </div>
                <textarea
                  className="w-full min-h-[80px] text-xs rounded-md border border-slate-800 bg-slate-900/80 px-3 py-2 text-slate-100 outline-none focus:border-emerald-500/60"
                  placeholder="이 세션을 읽으며 느낀 점, 외우고 싶은 표현 등을 적어보세요."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    disabled={isNoteSaving}
                    className="inline-flex items-center justify-center rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-600 px-4 py-1.5 text-[11px] font-medium text-slate-950 transition-colors"
                  >
                    {isNoteSaving ? "노트 저장 중..." : "노트 저장"}
                  </button>
                  <span className="text-[10px] text-slate-500">
                    세그먼트별로 1개 노트가 저장됩니다.
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 전체 읽기 계획 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm text-slate-200">
                전체 읽기 계획 (자동 생성)
              </div>
              <p className="text-xs text-slate-500">
                책 {BOOK_ID}, 주당 {SESSIONS_PER_WEEK}회 학습 기준 세션
                리스트입니다.
              </p>
            </div>
            <button
              type="button"
              onClick={reloadPlan}
              className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-900/60 hover:bg-slate-800 transition-colors"
            >
              읽기 계획 새로고침
            </button>
          </div>

          {!plan ? (
            <p className="text-xs text-slate-500">
              읽기 계획을 불러오는 중이거나, 아직 생성되지 않았습니다.
            </p>
          ) : (
            <div className="max-h-64 overflow-auto border border-slate-800 rounded-xl">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-900/80 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 border-b border-slate-800">
                      주차
                    </th>
                    <th className="px-3 py-2 border-b border-slate-800">
                      세션
                    </th>
                    <th className="px-3 py-2 border-b border-slate-800">
                      읽을 파트
                    </th>
                    <th className="px-3 py-2 border-b border-slate-800">
                      상태
                    </th>
                    <th className="px-3 py-2 border-b border-slate-800">
                      액션
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.sessions.map((s) => {
                    const isDone =
                      lastCompletedSegment >= s.chapterStart &&
                      lastCompletedSegment >= s.chapterEnd;
                    const nextSeg = lastCompletedSegment + 1 || 1;
                    const isNext =
                      nextSeg >= s.chapterStart && nextSeg <= s.chapterEnd;

                    return (
                      <tr
                        key={s.sessionIndex}
                        className={`border-b border-slate-900/60 ${
                          isDone
                            ? "bg-emerald-900/20"
                            : isNext
                            ? "bg-slate-900/40"
                            : "odd:bg-slate-900/20 even:bg-slate-900/5"
                        }`}
                      >
                        <td className="px-3 py-2">Week {s.weekIndex}</td>
                        <td className="px-3 py-2">
                          Session {s.sessionIndex}
                        </td>
                        <td className="px-3 py-2">
                          Part {s.chapterStart}
                          {s.chapterStart !== s.chapterEnd &&
                            ` - Part ${s.chapterEnd}`}
                        </td>
                        <td className="px-3 py-2">
                          {isDone
                            ? "완료"
                            : isNext
                            ? "오늘 읽을 세션"
                            : "대기"}
                        </td>
                        <td className="px-3 py-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              loadContentForSegment(s.chapterStart)
                            }
                            className="text-[11px] px-2 py-1 rounded-md border border-slate-600 bg-slate-950 hover:bg-slate-800 transition-colors"
                          >
                            본문 보기
                          </button>
                          <button
                            type="button"
                            disabled={isSaving || isDone}
                            onClick={() =>
                              handleCompleteSegment(s.chapterStart)
                            }
                            className="text-[11px] px-3 py-1 rounded-md border border-emerald-500/60 bg-emerald-500/10 disabled:bg-slate-700 disabled:border-slate-600 hover:bg-emerald-500/30 transition-colors"
                          >
                            {isDone ? "완료됨" : "완료로 기록"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 에러 */}
        {error && (
          <div className="text-xs text-red-400 border border-red-500/40 bg-red-950/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* 캘린더 */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm text-slate-200">
                학습 캘린더 (월별 요약)
              </div>
              <p className="text-xs text-slate-500">
                {todayMonth} 기준 studyLogs 컬렉션 데이터
              </p>
            </div>
            <button
              type="button"
              onClick={reloadCalendar}
              className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-900/60 hover:bg-slate-800 transition-colors"
            >
              새로고침
            </button>
          </div>

          {calendar.length === 0 ? (
            <p className="text-xs text-slate-500">
              아직 이 달에는 저장된 학습 기록이 없습니다.
            </p>
          ) : (
            <div className="max-h-40 overflow-auto border border-slate-800 rounded-xl">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-900/80 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 border-b border-slate-800">
                      날짜
                    </th>
                    <th className="px-3 py-2 border-b border-slate-800">
                      완료 세그먼트 수
                    </th>
                    <th className="px-3 py-2 border-b border-slate-800">
                      학습 시간(분)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {calendar.map((item) => (
                    <tr
                      key={item.date}
                      className="odd:bg-slate-900/40 even:bg-slate-900/10"
                    >
                      <td className="px-3 py-2 border-b border-slate-900/60">
                        {item.date}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-900/60">
                        {item.totalSegmentsCompleted ?? 0}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-900/60">
                        {item.totalStudyMinutes ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
