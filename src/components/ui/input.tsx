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
        "transition-soft flex min-h-[44px] w-full rounded-md border border-border bg-surface px-3.5 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "hover:border-[#d8d8de] focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
