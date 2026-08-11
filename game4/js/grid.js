// Shared well-grid <-> pixel geometry for one well. Used by both rendering
// and layout math. Takes a `layout` object as produced by Board.computeLayout.

const Grid = {
  cellRect(col, row, layout) {
    return {
      x: layout.wellX + col * layout.cellSize,
      y: layout.wellY + row * layout.cellSize,
      size: layout.cellSize,
    };
  },

  cellCenter(col, row, layout) {
    const rect = this.cellRect(col, row, layout);
    return { x: rect.x + rect.size / 2, y: rect.y + rect.size / 2 };
  },
};
