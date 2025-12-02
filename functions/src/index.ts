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

type ChapterContent = {
  bookId: string;
  trackId: string;
  segmentIndex: number;
  title: string;
  paragraphs: string[];
  estimatedMinutes: number;
};

// 간단한 데모용 본문 데이터 (1, 2번 세그먼트만 예시로)
const MOCK_CHAPTER_CONTENTS: ChapterContent[] = [
  {
    bookId: "little-women",
    trackId: "little-women-30",
    segmentIndex: 1,
    title: "Day 1 · Meeting the March Sisters",
    estimatedMinutes: 15,
    paragraphs: [
      "“Christmas won’t be Christmas without any presents,” grumbled Jo, lying on the rug.",
      "It’s so dreadful to be poor!” sighed Meg, looking down at her old dress.",
      "“I don’t think it’s fair that some girls have plenty of pretty things, and other girls nothing at all,” added little Amy with an injured sniff.",
      "“We’ve got Father and Mother, and each other,” said Beth contentedly from her corner."
    ]
  },
  {
    bookId: "little-women",
    trackId: "little-women-30",
    segmentIndex: 2,
    title: "Day 2 · A Modest Christmas",
    estimatedMinutes: 15,
    paragraphs: [
      "The four young faces on which the firelight shone brightened at the cheerful words.",
      "Poor they might be, but they were rich in love and in the simple hopes of a new year.",
      "Outside, the winter wind rattled the windows, but inside there was warmth, laughter, and the faint scent of something baking in the oven."
    ]
  }
];

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

  // GET /api/content?bookId=...&trackId=...&segmentIndex=...
  if (req.method === "GET" && path === "/content") {
    const bookId = (req.query.bookId as string) || "little-women";
    const trackId = (req.query.trackId as string) || "little-women-30";
    const segmentIndexRaw = (req.query.segmentIndex as string) || "1";
    const segmentIndex = parseInt(segmentIndexRaw, 10) || 1;

    // 목업 데이터 먼저 찾고, 없으면 기본 플레이스홀더 사용
    const found = MOCK_CHAPTER_CONTENTS.find(
      (c) =>
        c.bookId === bookId &&
        c.trackId === trackId &&
        c.segmentIndex === segmentIndex
    );

    const content: ChapterContent =
      found ||
      ({
        bookId,
        trackId,
        segmentIndex,
        title: `Day ${segmentIndex} · Sample Reading`,
        estimatedMinutes: 15,
        paragraphs: [
          "This is a placeholder passage for testing the reading view.",
          `You are reading segment ${segmentIndex} of the book "${bookId}".`,
          "Later, this will be replaced with real text from the chosen classic book."
        ]
      } as ChapterContent);

    res.status(200).json({
      ok: true,
      ...content
    });
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

    // POST /api/words  : 단어 저장 (더블클릭 용)
  if (req.method === "POST" && path === "/words") {
    const uid = getUid(req);
    const body = req.body || {};
    const { bookId, trackId, segmentIndex, word, contextText } = body;

    if (!bookId || !word) {
      res.status(400).json({
        ok: false,
        error: "bookId와 word는 필수입니다."
      });
      return;
    }

    const normalized = String(word).trim().toLowerCase();
    if (!normalized) {
      res.status(400).json({
        ok: false,
        error: "유효한 단어가 아닙니다."
      });
      return;
    }

    const segIndexNum = segmentIndex ? Number(segmentIndex) : null;

    try {
      // uid + bookId + normalized 조합으로 하나의 문서 사용
      const docId = `${uid}_${bookId}_${normalized}`;
      const ref = db.collection("userWords").doc(docId);

      const contextEntry = contextText
        ? {
            text: String(contextText),
            createdAt: FieldValue.serverTimestamp()
          }
        : null;

      const updateData: any = {
        uid,
        bookId,
        trackId: trackId || null,
        normalized,
        word,
        updatedAt: FieldValue.serverTimestamp()
      };

      if (segIndexNum !== null) {
        updateData.segmentIndex = segIndexNum;
      }
      if (contextEntry) {
        updateData.contexts = FieldValue.arrayUnion(contextEntry);
      }

      await ref.set(
        {
          createdAt: FieldValue.serverTimestamp(),
          ...updateData
        },
        { merge: true }
      );

      res.status(200).json({
        ok: true,
        message: "단어가 저장되었습니다.",
        word: normalized
      });
    } catch (e: any) {
      logger.error("Error in /words (POST)", e);
      res.status(500).json({
        ok: false,
        error: e?.message || "단어 저장 중 오류가 발생했습니다."
      });
    }
    return;
  }

  // GET /api/words?bookId=...  : 저장 단어 리스트
  if (req.method === "GET" && path === "/words") {
    const uid = getUid(req);
    const bookId = req.query.bookId as string | undefined;

    try {
      let query = db.collection("userWords").where("uid", "==", uid);
      if (bookId) {
        query = query.where("bookId", "==", bookId);
      }

      const snap = await query.orderBy("updatedAt", "desc").limit(200).get();
      const items = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      res.status(200).json({
        ok: true,
        count: items.length,
        items
      });
    } catch (e: any) {
      logger.error("Error in /words (GET)", e);
      res.status(500).json({
        ok: false,
        error: e?.message || "단어 목록을 불러오는 중 오류가 발생했습니다."
      });
    }
    return;
  }

    // POST /api/highlights : 하이라이트 추가
  if (req.method === "POST" && path === "/highlights") {
    const uid = getUid(req);
    const body = req.body || {};
    const { bookId, trackId, segmentIndex, text, color } = body;

    if (!bookId || !text) {
      res.status(400).json({
        ok: false,
        error: "bookId와 text는 필수입니다."
      });
      return;
    }

    const segIndexNum = segmentIndex ? Number(segmentIndex) : null;

    try {
      const ref = db.collection("userHighlights").doc();
      await ref.set({
        uid,
        bookId,
        trackId: trackId || null,
        segmentIndex: segIndexNum,
        highlightId: ref.id,
        text: String(text),
        color: color || "yellow",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      res.status(200).json({
        ok: true,
        message: "하이라이트가 저장되었습니다.",
        highlightId: ref.id
      });
    } catch (e: any) {
      logger.error("Error in /highlights (POST)", e);
      res.status(500).json({
        ok: false,
        error: e?.message || "하이라이트 저장 중 오류가 발생했습니다."
      });
    }
    return;
  }

  // GET /api/highlights?bookId=...&trackId=...&segmentIndex=...
  if (req.method === "GET" && path === "/highlights") {
    const uid = getUid(req);
    const bookId = req.query.bookId as string | undefined;
    const trackId = req.query.trackId as string | undefined;
    const segmentIndexRaw = req.query.segmentIndex as string | undefined;

    try {
      let query = db.collection("userHighlights").where("uid", "==", uid);

      if (bookId) {
        query = query.where("bookId", "==", bookId);
      }
      if (trackId) {
        query = query.where("trackId", "==", trackId);
      }
      if (segmentIndexRaw) {
        const segIndexNum = Number(segmentIndexRaw);
        query = query.where("segmentIndex", "==", segIndexNum);
      }

      const snap = await query.orderBy("createdAt", "asc").limit(500).get();
      const items = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      res.status(200).json({
        ok: true,
        count: items.length,
        items
      });
    } catch (e: any) {
      logger.error("Error in /highlights (GET)", e);
      res.status(500).json({
        ok: false,
        error: e?.message || "하이라이트 목록을 불러오는 중 오류가 발생했습니다."
      });
    }
    return;
  }


  // POST /api/insights : 인사이트/노트 저장 (upsert)
  if (req.method === "POST" && path === "/insights") {
    const uid = getUid(req);
    const body = req.body || {};
    const { bookId, trackId, segmentIndex, note } = body;

    if (!bookId || !segmentIndex) {
      res.status(400).json({
        ok: false,
        error: "bookId와 segmentIndex는 필수입니다."
      });
      return;
    }

    const segIndexNum = Number(segmentIndex);
    if (!note || String(note).trim().length === 0) {
      res.status(400).json({
        ok: false,
        error: "note 내용이 비어 있습니다."
      });
      return;
    }

    const docId = `${uid}_${bookId}_${trackId || "default"}_${segIndexNum}`;

    try {
      const ref = db.collection("userInsights").doc(docId);
      await ref.set(
        {
          uid,
          bookId,
          trackId: trackId || null,
          segmentIndex: segIndexNum,
          note: String(note),
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      res.status(200).json({
        ok: true,
        message: "인사이트가 저장되었습니다."
      });
    } catch (e: any) {
      logger.error("Error in /insights (POST)", e);
      res.status(500).json({
        ok: false,
        error: e?.message || "인사이트 저장 중 오류가 발생했습니다."
      });
    }
    return;
  }

  // GET /api/insights?bookId=...&trackId=...&segmentIndex=...
  if (req.method === "GET" && path === "/insights") {
    const uid = getUid(req);
    const bookId = req.query.bookId as string | undefined;
    const trackId = req.query.trackId as string | undefined;
    const segmentIndexRaw = req.query.segmentIndex as string | undefined;

    if (!bookId || !segmentIndexRaw) {
      res.status(400).json({
        ok: false,
        error: "bookId와 segmentIndex는 필수입니다."
      });
      return;
    }

    const segIndexNum = Number(segmentIndexRaw);
    const docId = `${uid}_${bookId}_${trackId || "default"}_${segIndexNum}`;

    try {
      const ref = db.collection("userInsights").doc(docId);
      const doc = await ref.get();

      if (!doc.exists) {
        res.status(200).json({
          ok: true,
          note: null
        });
        return;
      }

      res.status(200).json({
        ok: true,
        note: doc.data()?.note || ""
      });
    } catch (e: any) {
      logger.error("Error in /insights (GET)", e);
      res.status(500).json({
        ok: false,
        error: e?.message || "인사이트를 불러오는 중 오류가 발생했습니다."
      });
    }
    return;
  }
  res.status(404).json({
    ok: false,
    error: "Not found",
    path,
    method: req.method
  });
});
