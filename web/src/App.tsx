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

const FIREBASE_PROJECT_ID = "english-reading-habit-builder";

const API_BASE =
  import.meta.env.DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1/api`
    : "/api";

// POC: 일단 little-women 고정, 30세그먼트 트랙 하나라고 가정
const BOOK_ID = "little-women";
const TRACK_ID = "little-women-30";
const SESSIONS_PER_WEEK = 3;

function App() {
  const [health, setHealth] = useState<ApiResponseHealth | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [plan, setPlan] = useState<ReadingPlan["plan"] | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, []);

  // 첫 로드 시: 헬스 체크 + 진행 요약 + 캘린더 + 읽기 계획
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

  // 세그먼트 완료 처리 (segmentIndex를 매개변수로 받음)
  const handleCompleteSegment = async (segmentIndex: number) => {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/progress/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user" // POC: 나중에 Auth 붙이면 대체
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

      // 완료 후 진행 요약 + 캘린더 갱신
      reloadSummary();
      reloadCalendar();
    } catch (e) {
      console.error(e);
      setError("완료 처리 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const completionPercent =
    summary && summary.totalChapters
      ? Math.round(summary.completionRate * 100)
      : 0;

  const lastCompletedSegment =
    summary?.lastCompletedSegment != null ? summary.lastCompletedSegment : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="max-w-5xl w-full mx-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">english-learning-app</h1>
          <p className="text-sm text-slate-400">
            읽기 계획 · 진행도 · 캘린더 POC · React + Firebase Functions +
            Firestore
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

        {/* 읽기 계획 + 완료 버튼 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm text-slate-200">
                읽기 계획 (자동 생성)
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
                    const isNext =
                      lastCompletedSegment + 1 === s.chapterStart;

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
                            ? "다음 순서"
                            : "대기"}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={isSaving || isDone}
                            onClick={() =>
                              handleCompleteSegment(s.chapterStart)
                            }
                            className="text-[11px] px-3 py-1 rounded-md border border-emerald-500/60 bg-emerald-500/10 disabled:bg-slate-700 disabled:border-slate-600 hover:bg-emerald-500/30 transition-colors"
                          >
                            {isDone ? "완료됨" : "이 세션 완료로 기록"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {isSaving && (
            <p className="text-xs text-slate-400">
              완료 기록을 저장하는 중입니다...
            </p>
          )}
        </section>

        {/* 에러 메시지 */}
        {error && (
          <div className="text-xs text-red-400 border border-red-500/40 bg-red-950/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* 캘린더용 로그 리스트 */}
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
