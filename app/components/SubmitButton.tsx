"use client";

import { useFormStatus } from "react-dom";

type ButtonTheme = "primary";

export function SubmitButton({ theme }: { theme: ButtonTheme }) {
  const { pending } = useFormStatus();

  const themeClasses = {
    // primary: "hover:bg-blue-600 disabled:bg-gray-200",
    primary:
      "bg-[light-dark(#fffff, #63D5F8)] text-[light-dark(#171717, #ededed)] hover:bg-blue-200 disabled:bg-gray-200",
  };

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${themeClasses[theme]} py-2 px-10 rounded-3xl outline-1 w-fit h-fit`}
    >
      {pending ? "Processing..." : "Submit"}
    </button>
  );
}
