export type WorkspaceScreen =
  | "input"
  | "review"
  | "processing"
  | "result"
  | "history";
export type FlowState<A> = {
  screen: WorkspaceScreen;
  analysis: A | null;
  progress: { completed: number; total: number } | null;
};
export type FlowAction<A> =
  | { type: "screen"; value: WorkspaceScreen }
  | { type: "analysis"; value: A | null | ((current: A | null) => A | null) }
  | {
      type: "progress";
      value:
        | FlowState<A>["progress"]
        | ((current: FlowState<A>["progress"]) => FlowState<A>["progress"]);
    };
export function workspaceFlow<A>(
  state: FlowState<A>,
  action: FlowAction<A>,
): FlowState<A> {
  switch (action.type) {
    case "screen":
      return { ...state, screen: action.value };
    case "analysis":
      return {
        ...state,
        analysis:
          typeof action.value === "function"
            ? (action.value as (current: A | null) => A | null)(state.analysis)
            : action.value,
      };
    case "progress":
      return {
        ...state,
        progress:
          typeof action.value === "function"
            ? action.value(state.progress)
            : action.value,
      };
  }
}

/** Reconcile UI from the server after pause, retry or a lost response. */
export function recoveryScreen(
  status: string,
  confirmed: boolean,
): WorkspaceScreen {
  if (status === "completed") return "result";
  return confirmed && ["ready", "processing", "failed"].includes(status)
    ? "processing"
    : "review";
}
