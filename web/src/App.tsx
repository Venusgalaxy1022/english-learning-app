import { useEffect, useState } from "react";

type ApiResponse = {
  message: string;
  ok: boolean;
  time: string;
};

// 🔥 너의 실제 Firebase 프로젝트 ID로 꼭 바꿔주세요 🔥
// 예시: english-learning-app-12345
const FIREBASE_PROJECT_ID = "english-reading-habit-builder"; 

const API_URL =
  import.meta.env.DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1/api`
    : "/api";

function App() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then((json: ApiResponse) => setData(json))
      .catch((err) => {
        console.error(err);
        setError("API 호출 실패: Firebase 에뮬레이터가 켜져 있는지 확인해 주세요.");
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="max-w-md w-full mx-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2">english-learning-app</h1>
        <p className="text-sm text-slate-400 mb-4">
          React + Vite + TypeScript + Tailwind + Firebase Functions
        </p>

        <div className="mt-4 text-sm space-y-2">
          <div className="font-medium mb-1">/api 응답</div>

          {error && (
            <div className="text-xs text-red-400 border border-red-500/40 bg-red-950/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {data ? (
            <pre className="text-xs bg-slate-950/60 border border-slate-800 rounded-lg p-3 overflow-x-auto">
{JSON.stringify(data, null, 2)}
            </pre>
          ) : !error ? (
            <div className="text-slate-500">불러오는 중...</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default App;
