import type { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export function Container({ children, className = "" }: ContainerProps) {
  return (
    <div className={`mx-auto w-full max-w-content px-4 md:px-5 xl:px-12 ${className}`.trim()}>
      {children}
    </div>
  );
}
