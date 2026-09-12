"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SearchButton() {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Search (press /)"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("radar:open-palette"))
      }
    >
      <Search />
    </Button>
  );
}
