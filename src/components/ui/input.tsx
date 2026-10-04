import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        // Aturan baku form input: hitam 7,5% tanpa border (dark: putih 7,5%).
        "transition-soft min-h-[44px] w-full rounded-md border border-transparent bg-black/[0.075] px-3.5 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "hover:border-transparent hover:bg-black/[0.12] focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "dark:bg-white/[0.075] dark:hover:bg-white/[0.12]",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
