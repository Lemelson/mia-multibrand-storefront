const TWINSET_CDN_HOST = "twinset-cdn.thron.com";

type TwinsetSize = "card" | "detail" | "thumb";

const SIZE_BY_KIND: Record<TwinsetSize, string> = {
  card: "800x978",
  detail: "1280x1565",
  thumb: "200x200"
};

export function isTwinsetCdnUrl(url: string): boolean {
  return typeof url === "string" && url.includes(TWINSET_CDN_HOST);
}

export function getTwinsetImageBySize(url: string, kind: TwinsetSize): string {
  if (!isTwinsetCdnUrl(url)) {
    return url;
  }

  const size = SIZE_BY_KIND[kind];
  return url.replace(/\/std\/\d+x\d+\//, `/std/${size}/`);
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

