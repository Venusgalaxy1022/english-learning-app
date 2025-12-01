import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";


const app = initializeApp();
const db = getFirestore(app);

type Book = {
  id: string;
  title: string;
  author: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  totalChapters: number;
  tags: string[];
};

type Chapter = {
  id: string;
  index: number;
  title: string;
  estimatedMinutes: number;
};

type ReadingSession = {
  sessionIndex: number;
  weekIndex: number;
  chapterStart: number;
  chapterEnd: number;
};

const BOOKS: Book[] = [
  {
    id: "little-women",
    title: "Little Women",
    author: "Louisa May Alcott",
    level: "Intermediate",
    totalChapters: 30,
    tags: ["Classic", "Family", "Coming-of-age"]
  },
  {
    id: "anne-of-green-gables",
    title: "Anne of Green Gables",
    author: "L. M. Montgomery",
    level: "Intermediate",
    totalChapters: 30,
    tags: ["Classic", "Children", "School"]
  }
];

function buildChapters(book: Book): Chapter[] {
  const chapters: Chapter[] = [];
  for (let i = 1; i <= book.totalChapters; i++) {
    chapters.push({
      id: `${book.id}-ch-${i}`,
      index: i,
      title: `Part ${i}`,
      estimatedMinutes: 15
    });
  }
  return chapters;
}

function buildReadingPlan(
  book: Book,
  sessionsPerWeek: number
): {
  bookId: string;
  totalChapters: number;
  sessionsPerWeek: number;
  totalWeeks: number;
  sessions: ReadingSession[];
} {
  const chaptersPerSession = 1;
  const totalSessions = Math.ceil(book.totalChapters / chaptersPerSession);
  const totalWeeks = Math.ceil(totalSessions / sessionsPerWeek);

  const sessions: ReadingSession[] = [];
  let currentChapter = 1;

  for (let s = 1; s <= totalSessions; s++) {
    const weekIndex = Math.ceil(s / sessionsPerWeek);
    const chapterStart = currentChapter;
    const chapterEnd = Math.min(
      currentChapter + chaptersPerSession - 1,
      book.totalChapters
    );

    sessions.push({
      sessionIndex: s,
      weekIndex,
      chapterStart,
      chapterEnd
    });

    currentChapter = chapterEnd + 1;
  }

  return {
    bookId: book.id,
    totalChapters: book.totalChapters,
    sessionsPerWeek,
    totalWeeks,
    sessions
  };
}

function getUid(req: any): string {
  const header = req.headers["x-user-id"];
  if (typeof header === "string" && header.trim().length > 0) {
    return header;
  }
  // POC: 아직 auth 안 붙였으니 데모 유저 고정
  return "demo-user";
}


export const api = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const path = req.path || "/";

  logger.info("Request received at /api", {
    method: req.method,
    path,
    query: req.query
  });

  // GET /api
  if (req.method === "GET" && path === "/") {
    res.status(200).json({
      message: "API is up and running",
      ok: true,
      time: new Date().toISOString()
    });
    return;
  }

  // GET /api/books
  if (req.method === "GET" && path === "/books") {
    res.status(200).json({
      ok: true,
      count: BOOKS.length,
      items: BOOKS
    });
    return;
  }

  // 5) 진행도 완료 체크: POST /api/progress/complete
  if (req.method === "POST" && path === "/progress/complete") {
    const uid = getUid(req);
    const body = req.body || {};
    const { bookId, trackId, segmentIndex, timeSpentMinutes } = body;

    if (!bookId || !trackId || !segmentIndex) {
      res.status(400).json({
        ok: false,
        error: "bookId, trackId, segmentIndex는 필수입니다."
      });
      return;
    }

    const segIndexNum = parseInt(segmentIndex, 10);
    const timeSpent = Number(timeSpentMinutes || 0);
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const progressDocId = `${uid}_${bookId}_${trackId}_${segIndexNum}`;
    const progressRef = db.collection("userProgress").doc(progressDocId);

    await progressRef.set(
      {
        uid,
        bookId,
        trackId,
        segmentIndex: segIndexNum,
        status: "done",
        completedAt: now.toISOString(),
        timeSpentMinutes: timeSpent
      },
      { merge: true }
    );

    const logDocId = `${uid}_${isoDate}`;
    const logRef = db.collection("studyLogs").doc(logDocId);

    await logRef.set(
      {
        uid,
        date: isoDate,
        updatedAt: FieldValue.serverTimestamp(),
        totalSegmentsCompleted: FieldValue.increment(1),
        totalStudyMinutes: FieldValue.increment(timeSpent)
      },
      { merge: true }
    );

    res.status(200).json({
      ok: true,
      message: "학습 완료가 저장되었습니다.",
      date: isoDate,
      segmentIndex: segIndexNum
    });
    return;
  }

    // 6) 진행도 요약: GET /api/progress/summary?bookId=...&trackId=...
  if (req.method === "GET" && path === "/progress/summary") {
    const uid = getUid(req);
    const bookId = req.query.bookId as string;
    const trackId = req.query.trackId as string;

    if (!bookId || !trackId) {
      res.status(400).json({
        ok: false,
        error: "bookId와 trackId 쿼리 파라미터가 필요합니다."
      });
      return;
    }

    const snap = await db
      .collection("userProgress")
      .where("uid", "==", uid)
      .where("bookId", "==", bookId)
      .where("trackId", "==", trackId)
      .where("status", "==", "done")
      .get();

    const completedCount = snap.size;
    // POC: 일단 30개 트랙 고정
    const totalChapters = 30;
    const completionRate = totalChapters
      ? completedCount / totalChapters
      : 0;

    let lastCompletedSegment: number | null = null;
    snap.forEach((doc) => {
      const data = doc.data() as any;
      if (typeof data.segmentIndex === "number") {
        if (lastCompletedSegment === null) {
          lastCompletedSegment = data.segmentIndex;
        } else {
          lastCompletedSegment = Math.max(
            lastCompletedSegment,
            data.segmentIndex
          );
        }
      }
    });

    res.status(200).json({
      ok: true,
      bookId,
      trackId,
      totalChapters,
      completedCount,
      completionRate,
      lastCompletedSegment
    });
    return;
  }

    // 7) 캘린더용 로그: GET /api/progress/calendar?month=YYYY-MM
  // 7) 캘린더용 로그: GET /api/progress/calendar?month=YYYY-MM
  if (req.method === "GET" && path === "/progress/calendar") {
    try {
      const uid = getUid(req);
      const monthParam = (req.query.month as string) || "";
      const now = new Date();

      const year = monthParam
        ? parseInt(monthParam.slice(0, 4), 10)
        : now.getFullYear();
      const month = monthParam
        ? parseInt(monthParam.slice(5, 7), 10)
        : now.getMonth() + 1; // JS month는 0-based

      const monthStr = `${year}-${String(month).padStart(2, "0")}`;
      const startDate = `${monthStr}-01`;
      const endDate = `${monthStr}-31`;

      const snap = await db
        .collection("studyLogs")
        .where("uid", "==", uid)
        .where("date", ">=", startDate)
        .where("date", "<=", endDate)
        .orderBy("date", "asc")
        .get();

      const items = snap.docs.map((doc) => doc.data());

      res.status(200).json({
        ok: true,
        month: monthStr,
        count: items.length,
        items
      });
    } catch (e: any) {
      logger.error("Error in /progress/calendar", e);
      res.status(500).json({
        ok: false,
        error:
          e?.message || "캘린더 데이터를 불러오는 중 오류가 발생했습니다."
      });
    }
    return;
  }


  // GET /api/books/:id/chapters
  if (
    req.method === "GET" &&
    path.startsWith("/books/") &&
    path.endsWith("/chapters")
  ) {
    const segments = path.split("/").filter(Boolean);
    const bookId = segments[1];

    const book = BOOKS.find((b) => b.id === bookId);
    if (!book) {
      res.status(404).json({ ok: false, error: "Book not found" });
      return;
    }

    const chapters = buildChapters(book);
    res.status(200).json({
      ok: true,
      book,
      chapters
    });
    return;
  }

  // GET /api/reading-plan?bookId=...&sessionsPerWeek=3
  if (req.method === "GET" && path === "/reading-plan") {
    const bookId = (req.query.bookId as string) || "little-women";
    const sessionsPerWeekRaw = (req.query.sessionsPerWeek as string) || "3";
    const sessionsPerWeek = Math.max(
      1,
      Math.min(7, parseInt(sessionsPerWeekRaw, 10) || 3)
    );

    const book = BOOKS.find((b) => b.id === bookId);
    if (!book) {
      res.status(404).json({ ok: false, error: "Book not found" });
      return;
    }

    const plan = buildReadingPlan(book, sessionsPerWeek);
    res.status(200).json({
      ok: true,
      plan
    });
    return;
  }

  res.status(404).json({
    ok: false,
    error: "Not found",
    path,
    method: req.method
  });
});
