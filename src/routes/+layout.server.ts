import { hasLiveVoice } from "$lib/server/llm";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  return { liveAvailable: hasLiveVoice() };
};
