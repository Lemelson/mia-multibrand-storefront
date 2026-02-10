import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="mb-4 text-xs text-text-secondary" aria-label="Хлебные крошки">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={`${item.label}-${index}`}>
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-text-primary">
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}
            {!isLast && <span className="mx-2">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
