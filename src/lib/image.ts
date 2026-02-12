const TWINSET_CDN_HOST = "twinset-cdn.thron.com";
const LOCAL_PRODUCTS_PREFIX = "/media/products/";

type TwinsetSize = "card" | "detail" | "thumb";

const PROFILE_BY_KIND: Record<TwinsetSize, { size: string; quality: string }> = {
  // 3:4-ish ratios match Twinset originals, but with lighter payload.
  card: { size: "640x782", quality: "72" },
  detail: { size: "960x1173", quality: "82" },
  thumb: { size: "160x196", quality: "65" }
};

export function isTwinsetCdnUrl(url: string): boolean {
  return typeof url === "string" && url.includes(TWINSET_CDN_HOST);
}

export function isLocalProductImage(url: string): boolean {
  return typeof url === "string" && url.startsWith(LOCAL_PRODUCTS_PREFIX);
}

function getLocalImageBySize(url: string, kind: TwinsetSize): string {
  if (!isLocalProductImage(url)) {
    return url;
  }

  if (kind === "detail") {
    return url;
  }

  if (url.includes("/detail/")) {
    return url.replace("/detail/", kind === "card" ? "/card/" : "/thumb/");
  }

  return url;
}

export function getTwinsetImageBySize(url: string, kind: TwinsetSize): string {
  if (isLocalProductImage(url)) {
    return getLocalImageBySize(url, kind);
  }

  if (!isTwinsetCdnUrl(url)) {
    return url;
  }

  const { size, quality } = PROFILE_BY_KIND[kind];
  const resizedUrl = url.replace(/\/std\/\d+x\d+\//, `/std/${size}/`);

  try {
    const parsed = new URL(resizedUrl);
    parsed.searchParams.set("quality", quality);
    parsed.searchParams.set("format", "auto");
    return parsed.toString();
  } catch {
    return resizedUrl;
  }
}

export function getCatalogImageUrl(url: string): string {
  return getTwinsetImageBySize(url, "card");
}

export function getProductDetailImageUrl(url: string): string {
  return getTwinsetImageBySize(url, "detail");
}

export function getProductThumbImageUrl(url: string): string {
  return getTwinsetImageBySize(url, "thumb");
}

export function getProductOriginalImageUrl(url: string): string {
  if (!isLocalProductImage(url)) {
    return url;
  }

  if (url.includes("/detail/")) {
    return url.replace("/detail/", "/original/");
  }

  return url;
}
