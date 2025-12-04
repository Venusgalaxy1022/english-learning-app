// scripts/importBooks.cjs
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// 🔧 1) 로컬 Firestore 에뮬레이터 + Project ID 설정
//   - functions에서 쓰던 Firebase 프로젝트 ID와 동일하게 맞춰줌
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  process.env.GOOGLE_CLOUD_PROJECT = "english-reading-habit-builder";
}

//   - Firestore 에뮬레이터 기본 포트 (8080) 사용
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

/**
 * @typedef {Object} ImportBookConfig
 * @property {string} id
 * @property {string} title
 * @property {string} author
 * @property {"Beginner" | "Intermediate" | "Advanced"} level
 * @property {number} totalSegments
 * @property {string} filePath
 */

const ROOT_DIR = process.cwd();

/** @type {ImportBookConfig[]} */
const BOOKS_TO_IMPORT = [
  {
    id: "little-women",
    title: "Little Women",
    author: "Louisa May Alcott",
    level: "Intermediate",
    totalSegments: 30,
    // 📌 폴더에 있는 파일 이름 그대로 사용 (little_women.txt)
    filePath: path.join(ROOT_DIR, "texts/little_women.txt")
  },
  {
    id: "anne-of-green-gables",
    title: "Anne of Green Gables",
    author: "L. M. Montgomery",
    level: "Intermediate",
    totalSegments: 30,
    filePath: path.join(ROOT_DIR, "texts/anne-of-green-gables.txt")
  }
];

// Firebase Admin 초기화
// Firebase Admin 초기화 (에뮬레이터용 Project ID 지정)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT
  });
}


const db = admin.firestore();

// -------- 유틸 함수들 --------

/**
 * 빈 줄 기준으로 텍스트를 문단으로 자르기
 * @param {string} raw
 * @returns {string[]}
 */
function splitIntoParagraphs(raw) {
  if (!raw) return [];
  return raw
    .split(/\r?\n\r?\n+/) // 빈 줄 1회 이상
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

/**
 * 문단 배열을 지정된 세그먼트 수로 나누기
 * @param {string[]} paragraphs
 * @param {number} totalSegments
 * @returns {string[][]}
 */
function splitParagraphsIntoSegments(paragraphs, totalSegments) {
  const total = paragraphs.length;
  if (total === 0 || !Number.isFinite(totalSegments) || totalSegments <= 0) {
    return [];
  }

  const perSegment = Math.ceil(total / totalSegments);
  const segments = [];

  for (let i = 0; i < totalSegments; i++) {
    const start = i * perSegment;
    const end = Math.min(start + perSegment, total);
    if (start >= end) break;
    segments.push(paragraphs.slice(start, end));
  }

  return segments;
}

/**
 * 책 한 권 임포트
 * @param {ImportBookConfig} config
 */
async function importOneBook(config) {
  console.log(`\n=== Importing book: ${config.id} ===`);
  console.log(`Reading file from: ${config.filePath}`);

  if (!fs.existsSync(config.filePath)) {
    console.error(`❌ File not found: ${config.filePath}`);
    return;
  }

  const raw = fs.readFileSync(config.filePath, "utf-8");
  const paragraphs = splitIntoParagraphs(raw);

  console.log(`Total paragraphs: ${paragraphs.length}`);

  const segments = splitParagraphsIntoSegments(
    paragraphs,
    config.totalSegments
  );

  console.log(`Segments created: ${segments.length}`);

  if (segments.length === 0) {
    console.error(
      "❌ No segments created. Check the input text or split logic."
    );
    return;
  }

  // 1) books 컬렉션에 메타데이터 저장
  const bookRef = db.collection("books").doc(config.id);
  await bookRef.set(
    {
      id: config.id,
      title: config.title,
      author: config.author,
      level: config.level,
      totalSegments: segments.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // 2) 각 세그먼트를 bookSegments에 저장
  const batch = db.batch();

  segments.forEach((paragraphsSegment, index) => {
    const segmentIndex = index + 1;
    const docId = `${config.id}_${segmentIndex}`;
    const segRef = db.collection("bookSegments").doc(docId);

    batch.set(
      segRef,
      {
        bookId: config.id,
        segmentIndex,
        title: `Part ${segmentIndex}`,
        paragraphs: paragraphsSegment,
        estimatedMinutes: 15,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });

  await batch.commit();
  console.log(`✅ Imported ${segments.length} segments for ${config.id}`);
}

async function main() {
  for (const book of BOOKS_TO_IMPORT) {
    await importOneBook(book);
  }
  console.log("\n🎉 All books imported.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});