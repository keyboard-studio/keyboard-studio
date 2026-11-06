// layoutPanelProps — what the Layout tab's pane receives from the editor adapter. Kept apart from
// the adapter (which lazy-loads the pane) so the pane can name the type without a dependency cycle.

/** What the Layout tab's panel receives from the adapter that hosts it. */
export interface LayoutPanelProps {
  /** Switch to the Code tab and reveal the source line of this IR node. */
  readonly onViewInCode: (nodeId: string) => void;
}
