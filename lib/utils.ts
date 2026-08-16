import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The type scale's steps have to be declared here, not just in globals.css.
//
// tailwind-merge only knows the font sizes Tailwind ships with. Handed
// "text-body" it cannot tell a size from a colour, guesses colour, and then
// treats it as conflicting with "text-text-1". So cn("text-body", "text-text-1")
// silently returned only one of them, and which one depended on the order the
// classes happened to be written in. Half the app kept its size and lost its
// colour, the other half kept its colour and fell back to the browser default
// of 16px. That is what "bigger and no consistency" was.
//
// Adding a step to the scale in globals.css means adding it to this list too.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro",
            "label",
            "meta",
            "body",
            "lead",
            "h3",
            "h2",
            "h1",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
