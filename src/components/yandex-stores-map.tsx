"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Store } from "@/lib/types";

type StoreForMap = Pick<Store, "id" | "name" | "fullName" | "address" | "coordinates">;

declare global {
  interface Window {
    ymaps?: any;
    __ymapsInitPromise?: Promise<any>;
  }
}

interface YandexStoresMapProps {
  stores: StoreForMap[];
}

export function YandexStoresMap({ stores }: YandexStoresMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const placemarksRef = useRef<Map<string, any>>(new Map());

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStoreId, setActiveStoreId] = useState(stores[0]?.id ?? "");

  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.trim() ?? "";

  const center = useMemo(() => {
    const first = stores[0];
    if (!first) {
      return [55.751574, 37.573856];
    }

    return [first.coordinates.lat, first.coordinates.lng];
  }, [stores]);

  useEffect(() => {
    if (!mapContainerRef.current || stores.length === 0 || !apiKey) {
      return;
    }

    let cancelled = false;
    const placemarks = placemarksRef.current;

    async function setupMap() {
      try {
        const ymaps = await loadYandexMaps(apiKey);

        if (cancelled || !mapContainerRef.current) {
          return;
        }

        const map = new ymaps.Map(
          mapContainerRef.current,
          {
            center,
            zoom: 11,
            controls: ["zoomControl", "fullscreenControl"]
          },
          {
            suppressMapOpenBlock: true
          }
        );

        mapRef.current = map;

        for (const store of stores) {
          const placemark = new ymaps.Placemark(
            [store.coordinates.lat, store.coordinates.lng],
            {
              hintContent: store.name,
              balloonContentHeader: store.fullName ?? store.name,
              balloonContentBody: store.address
            },
            {
              preset:
                store.id === "twinset-krasnaya-polyana"
                  ? "islands#blueShoppingIcon"
                  : "islands#blackDotIcon"
            }
          );

          map.geoObjects.add(placemark);
          placemarks.set(store.id, placemark);
        }

        const bounds = map.geoObjects.getBounds();
        if (bounds) {
          map.setBounds(bounds, {
            checkZoomRange: true,
            zoomMargin: 50,
            duration: 250
          });
        }

        setReady(true);
      } catch (setupError) {
        const message = setupError instanceof Error ? setupError.message : "Не удалось загрузить карту";
        setError(message);
      }
    }

    setupMap();

    return () => {
      cancelled = true;
      placemarks.clear();
      const map = mapRef.current;
      if (map) {
        map.destroy();
        mapRef.current = null;
      }
    };
  }, [apiKey, center, stores]);

  function focusStore(storeId: string) {
    setActiveStoreId(storeId);

    const store = stores.find((item) => item.id === storeId);
    if (!store || !mapRef.current) {
      return;
    }

    mapRef.current.setCenter([store.coordinates.lat, store.coordinates.lng], 15, {
      duration: 250
    });

    const placemark = placemarksRef.current.get(storeId);
    placemark?.balloon?.open();
  }

  if (stores.length === 0) {
    return (
      <div className="rounded border border-border bg-white p-4 text-sm text-text-secondary">
        Точки магазинов пока не добавлены.
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="rounded border border-border bg-white p-4 text-sm text-text-secondary">
        Для отображения карты укажите `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` в переменных окружения.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div
        ref={mapContainerRef}
        className="h-[420px] rounded border border-border bg-white"
      />

      <div className="space-y-2 rounded border border-border bg-white p-3">
        {!ready && !error && (
          <p className="text-sm text-text-secondary">Загрузка карты...</p>
        )}

        {error && (
          <p className="text-sm text-error">
            {error}
          </p>
        )}

        {stores.map((store) => {
          const active = store.id === activeStoreId;
          return (
            <button
              key={store.id}
              type="button"
              onClick={() => focusStore(store.id)}
              className={`w-full rounded border px-3 py-2 text-left transition ${
                active
                  ? "border-text-primary bg-bg-secondary"
                  : "border-border hover:bg-bg-secondary"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.08em] text-text-muted">{store.name}</p>
              <p className="mt-1 text-sm text-text-primary">{store.address}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function loadYandexMaps(apiKey: string): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Map is available only in browser"));
  }

  if (window.ymaps?.Map) {
    return Promise.resolve(window.ymaps);
  }

  if (window.__ymapsInitPromise) {
    return window.__ymapsInitPromise;
  }

  window.__ymapsInitPromise = new Promise((resolve, reject) => {
    const scriptId = "yandex-maps-js-api";

    const onReady = () => {
      if (!window.ymaps) {
        reject(new Error("Yandex Maps JS API not available"));
        return;
      }

      window.ymaps.ready(() => resolve(window.ymaps));
    };

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      if (window.ymaps) {
        onReady();
        return;
      }

      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Yandex Maps script")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.onload = onReady;
    script.onerror = () => reject(new Error("Failed to load Yandex Maps script"));

    document.head.appendChild(script);
  });

  return window.__ymapsInitPromise;
}
