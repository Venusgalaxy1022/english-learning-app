"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const app = (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)(app);
const BOOKS = [
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
function buildChapters(book) {
    const chapters = [];
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
function buildReadingPlan(book, sessionsPerWeek) {
    const chaptersPerSession = 1;
    const totalSessions = Math.ceil(book.totalChapters / chaptersPerSession);
    const totalWeeks = Math.ceil(totalSessions / sessionsPerWeek);
    const sessions = [];
    let currentChapter = 1;
    for (let s = 1; s <= totalSessions; s++) {
        const weekIndex = Math.ceil(s / sessionsPerWeek);
        const chapterStart = currentChapter;
        const chapterEnd = Math.min(currentChapter + chaptersPerSession - 1, book.totalChapters);
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
function getUid(req) {
    const header = req.headers["x-user-id"];
    if (typeof header === "string" && header.trim().length > 0) {
        return header;
    }
    // POC: 아직 auth 안 붙였으니 데모 유저 고정
    return "demo-user";
}
exports.api = (0, https_1.onRequest)(async (req, res) => {
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
        await progressRef.set({
            uid,
            bookId,
            trackId,
            segmentIndex: segIndexNum,
            status: "done",
            completedAt: now.toISOString(),
            timeSpentMinutes: timeSpent
        }, { merge: true });
        const logDocId = `${uid}_${isoDate}`;
        const logRef = db.collection("studyLogs").doc(logDocId);
        await logRef.set({
            uid,
            date: isoDate,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            totalSegmentsCompleted: firestore_1.FieldValue.increment(1),
            totalStudyMinutes: firestore_1.FieldValue.increment(timeSpent)
        }, { merge: true });
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
        const bookId = req.query.bookId;
        const trackId = req.query.trackId;
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
        let lastCompletedSegment = null;
        snap.forEach((doc) => {
            const data = doc.data();
            if (typeof data.segmentIndex === "number") {
                if (lastCompletedSegment === null) {
                    lastCompletedSegment = data.segmentIndex;
                }
                else {
                    lastCompletedSegment = Math.max(lastCompletedSegment, data.segmentIndex);
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
            const monthParam = req.query.month || "";
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
        }
        catch (e) {
            logger.error("Error in /progress/calendar", e);
            res.status(500).json({
                ok: false,
                error: e?.message || "캘린더 데이터를 불러오는 중 오류가 발생했습니다."
            });
        }
        return;
    }
    // GET /api/content?bookId=...&trackId=...&segmentIndex=...
    // /api/content를 Firestore 기반으로 바꾸기
    if (req.method === "GET" && path === "/content") {
        const bookId = req.query.bookId;
        const trackId = req.query.trackId; // 아직은 사용 안 해도 OK
        const segmentIndexRaw = req.query.segmentIndex;
        if (!bookId || !segmentIndexRaw) {
            res.status(400).json({
                ok: false,
                error: "bookId와 segmentIndex는 필수입니다."
            });
            return;
        }
        const segmentIndex = Number(segmentIndexRaw);
        if (!Number.isFinite(segmentIndex) || segmentIndex <= 0) {
            res.status(400).json({
                ok: false,
                error: "segmentIndex는 1 이상의 숫자여야 합니다."
            });
            return;
        }
        const docId = `${bookId}_${segmentIndex}`;
        try {
            const ref = db.collection("bookSegments").doc(docId);
            const snap = await ref.get();
            if (!snap.exists) {
                res.status(404).json({
                    ok: false,
                    error: "해당 세그먼트 텍스트를 찾을 수 없습니다.",
                    bookId,
                    segmentIndex
                });
                return;
            }
            const data = snap.data();
            res.status(200).json({
                ok: true,
                bookId,
                trackId: trackId || null,
                segmentIndex,
                title: data.title || `Part ${segmentIndex}`,
                paragraphs: data.paragraphs || [],
                estimatedMinutes: data.estimatedMinutes || 15
            });
        }
        catch (e) {
            logger.error("Error in /content", e);
            res.status(500).json({
                ok: false,
                error: e?.message || "본문을 불러오는 중 오류가 발생했습니다."
            });
        }
        return;
    }
    // GET /api/books/:id/chapters
    if (req.method === "GET" &&
        path.startsWith("/books/") &&
        path.endsWith("/chapters")) {
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
        const bookId = req.query.bookId || "little-women";
        const sessionsPerWeekRaw = req.query.sessionsPerWeek || "3";
        const sessionsPerWeek = Math.max(1, Math.min(7, parseInt(sessionsPerWeekRaw, 10) || 3));
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
                    createdAt: new Date().toISOString()
                }
                : null;
            const updateData = {
                uid,
                bookId,
                trackId: trackId || null,
                normalized,
                word,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            };
            if (segIndexNum !== null) {
                updateData.segmentIndex = segIndexNum;
            }
            if (contextEntry) {
                updateData.contexts = firestore_1.FieldValue.arrayUnion(contextEntry);
            }
            await ref.set({
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                ...updateData
            }, { merge: true });
            res.status(200).json({
                ok: true,
                message: "단어가 저장되었습니다.",
                word: normalized
            });
        }
        catch (e) {
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
        const bookId = req.query.bookId;
        try {
            let query = db.collection("userWords").where("uid", "==", uid);
            if (bookId) {
                query = query.where("bookId", "==", bookId);
            }
            // 🔧 정렬은 잠깐 빼고, 인덱스 없이 최대 200개만 가져오도록
            const snap = await query.limit(200).get();
            const items = snap.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            res.status(200).json({
                ok: true,
                count: items.length,
                items
            });
        }
        catch (e) {
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
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
            res.status(200).json({
                ok: true,
                message: "하이라이트가 저장되었습니다.",
                highlightId: ref.id
            });
        }
        catch (e) {
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
        const bookId = req.query.bookId;
        const trackId = req.query.trackId;
        const segmentIndexRaw = req.query.segmentIndex;
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
        }
        catch (e) {
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
            await ref.set({
                uid,
                bookId,
                trackId: trackId || null,
                segmentIndex: segIndexNum,
                note: String(note),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                createdAt: firestore_1.FieldValue.serverTimestamp()
            }, { merge: true });
            res.status(200).json({
                ok: true,
                message: "인사이트가 저장되었습니다."
            });
        }
        catch (e) {
            logger.error("Error in /insights (POST)", e);
            res.status(500).json({
                ok: false,
                error: e?.message || "인사이트 저장 중 오류가 발생했습니다."
            });
        }
        return;
    }
    // GET /api/insights?bookId=...&trackId=...&segmentIndex=...
    // - bookId + segmentIndex 있으면: 해당 세그먼트의 단일 노트
    // - bookId만 있으면: 해당 책의 모든 노트 목록
    if (req.method === "GET" && path === "/insights") {
        const uid = getUid(req);
        const bookId = req.query.bookId;
        const trackId = req.query.trackId;
        const segmentIndexRaw = req.query.segmentIndex;
        if (!bookId) {
            res.status(400).json({
                ok: false,
                error: "bookId는 필수입니다."
            });
            return;
        }
        // 1) 세그먼트 단일 조회 모드
        if (segmentIndexRaw) {
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
            }
            catch (e) {
                logger.error("Error in /insights (GET single)", e);
                res.status(500).json({
                    ok: false,
                    error: e?.message || "인사이트를 불러오는 중 오류가 발생했습니다."
                });
            }
            return;
        }
        // 2) 책 단위 목록 조회 모드: /api/insights?bookId=...
        try {
            let query = db
                .collection("userInsights")
                .where("uid", "==", uid)
                .where("bookId", "==", bookId);
            if (trackId) {
                query = query.where("trackId", "==", trackId);
            }
            const snap = await query.limit(200).get();
            const items = snap.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            res.status(200).json({
                ok: true,
                items
            });
        }
        catch (e) {
            logger.error("Error in /insights (GET list)", e);
            res.status(500).json({
                ok: false,
                error: e?.message || "인사이트 목록을 불러오는 중 오류가 발생했습니다."
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
//# sourceMappingURL=index.js.map