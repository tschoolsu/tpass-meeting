"use client";

import { Button } from "tpass-ui";

export function PrintButton({ label = "列印／存成 PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="primary" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
