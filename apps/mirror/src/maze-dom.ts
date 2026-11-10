/** Preserve unchanged text nodes, especially in live regions polled by the viewer. */
export function setMazeText(node: Node, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}
