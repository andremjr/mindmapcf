import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/blank")({
  component: Blank,
});

function Blank() {
  return <div />;
}
