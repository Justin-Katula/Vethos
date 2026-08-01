import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva("inline-flex items-center justify-center gap-3 rounded-button whitespace-nowrap transition-all duration-200 ease-in-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50", {
    variants: {
        variant: {
            default: "border border-laser bg-laser font-medium text-scheme-btn-text hover:border-laser-dark hover:bg-laser-dark btn-light:border-white btn-light:bg-white btn-light:text-neutral-darkest btn-light:hover:border-neutral-lighter btn-light:hover:bg-neutral-lighter",
            alternate: "border border-white bg-white text-neutral-darkest hover:border-neutral-lighter hover:bg-neutral-lighter",
            secondary: "border border-neutral-darkest-15 bg-transparent font-medium hover:bg-neutral-darkest-5 alternate:border-white-15 alternate:bg-transparent alternate:hover:border-neutral-lighter alternate:hover:bg-white-10",
            "secondary-alt": "border border-white-15 bg-transparent font-medium text-white hover:border-neutral-lighter hover:bg-white-10",
            link: "gap-2 text-scheme-text",
            "link-alt": "gap-2 text-white",
            ghost: "hover:bg-neutral-darkest hover:text-white",
            none: "",
        },
        size: {
            default: "px-6 py-2.5",
            sm: "px-5 py-2",
            link: "p-0",
            icon: "size-10",
            none: "",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
    },
});
function Button({ className, variant, size, asChild = false, iconLeft, iconRight, children, ...props }) {
    const Comp = asChild ? Slot : "button";
    return (<Comp data-slot="button" data-variant={variant || "default"} className={cn(buttonVariants({ variant, size, className }))} {...props}>
      {iconLeft && iconLeft}
      <Slottable>{children}</Slottable>
      {iconRight && iconRight}
    </Comp>);
}
export { Button, buttonVariants };
