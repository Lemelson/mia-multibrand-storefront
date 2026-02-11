"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showDevPasswordHint = process.env.NODE_ENV !== "production";
  const devPasswordHint = process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD || "см. .env.local";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      setError("Неверный пароль");
      setLoading(false);
      return;
    }

    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-md border border-border p-6">
      <h1 className="font-logo text-3xl">Админ-панель</h1>
      <p className="mt-2 text-sm text-text-secondary">Введите пароль для доступа к товарам и заказам.</p>

      <label className="mt-6 block text-sm">
        Пароль
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          className="mt-2 w-full border border-border px-3 py-3"
          required
        />
      </label>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      <button
        type="submit"
        className="mt-5 w-full bg-text-primary px-4 py-3 text-xs uppercase tracking-[0.08em] text-white disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "Вход..." : "Войти"}
      </button>

      {showDevPasswordHint && (
        <p className="mt-4 text-xs text-text-muted">
          DEV-подсказка пароля: `{devPasswordHint}`. Для продакшена используйте безопасные `ADMIN_PASSWORD` и `ADMIN_SECRET`.
        </p>
      )}
    </form>
  );
}
