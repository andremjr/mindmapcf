import { resolveImage } from "./imageStorage";
import { startRecording } from "./screenRecorder";
import { saveRecordFormat, type RecordFormat } from "./recordFormats";
import type { Project } from "./types";

/**
 * Shared "start recording for this project" launcher used by every template
 * editor (mindmap / tierlist / iceberg). Must be called from a user gesture.
 * Resolves once the MediaRecorder is armed — the caller then navigates to
 * the presentation route with `?record=1`.
 */
export async function launchRecording(
  project: Project,
  fmt: RecordFormat,
  isPro: boolean,
): Promise<void> {
  saveRecordFormat(project.id, fmt);
  let narrationEl: HTMLAudioElement | undefined;
  if (isPro && project.narrationRef) {
    try {
      const url = await resolveImage(project.narrationRef);
      if (url) {
        narrationEl = new Audio(url);
        narrationEl.preload = "auto";
        narrationEl.crossOrigin = "anonymous";
      }
    } catch (e) {
      console.warn("[launchRecording] resolve narration", e);
    }
  }
  await startRecording({
    filenameBase: project.title || "apresentacao",
    armed: true,
    narrationEl,
    targetWidth: fmt.width,
    targetHeight: fmt.height,
  });
}
