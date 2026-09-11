# Chess.com Live Game DOM — Research Notes

Captured 2026-09-12 by playing a guest game against a bot at `chess.com/play/computer`
and inspecting the live DOM with devtools-style JS execution. Chess.com changes their
markup periodically, so treat class names as "current, but re-verify if selectors
suddenly stop matching."

**Important caveat on coordinates:** if you ever automate clicks against chess.com,
note that `window.devicePixelRatio` can be ≠ 1 (we saw 1.25), which means CSS pixel
coordinates from `getBoundingClientRect()` are NOT the same as screen/screenshot pixel
coordinates. Multiply CSS-pixel rects by `devicePixelRatio` if you're driving clicks
from a scaled screenshot. This doesn't matter for the extension itself (content
scripts read DOM values / listen to mutations, they don't need to click anything), but
it's a good gotcha to know about while testing.

## 1. The board and pieces

The board web component:

```html
<wc-chess-board class="board">...</wc-chess-board>
```

Each piece is a plain `<div>` positioned with a CSS class, not with inline
`top`/`left` styles:

```html
<div class="piece br square-88"></div>   <!-- black rook on h8 -->
<div class="piece wp square-52"></div>   <!-- white pawn on e2 -->
```

- Piece class = `{color}{type}` — `w`/`b` + `p`/`n`/`b`/`r`/`q`/`k`
  (e.g. `wp` = white pawn, `bn` = black knight).
- Square class = `square-{file}{rank}` where **file and rank are digits 1–8**,
  file 1 = `a`, file 8 = `h`. So `square-52` = file 5 (`e`), rank 2 → **e2**.
  `square-88` = file 8 (`h`), rank 8 → **h8**.

To find "what's on e4" you'd look for `.piece.square-54`. To find "what piece is on
square X" in general, query `.piece[class*="square-XY"]` and read off the other class
for color+type.

This is enough to read full board state at any instant, but **you don't need to**
for this project — the move list (next section) is a much cleaner signal, since it's
already-validated SAN text rather than positions you'd have to diff yourself.

## 2. The move list (this is the important one)

Container:

```html
<wc-simple-move-list class="play-controller-moveList move-list chessboard-pkg-move-list-component">
```

No shadow DOM — it's plain light-DOM HTML that a `MutationObserver` can watch
directly. Each played move-pair renders as a row:

```html
<div class="main-line-row move-list-row light-row" data-whole-move-number="1">
  1.
  <div data-node="0-0" class="node white-move main-line-ply">
    <span class="node-highlight-content offset-for-annotation-icon">e4 </span>
  </div>
  <div data-node="0-1" class="node black-move main-line-ply">
    <span class="node-highlight-content offset-for-annotation-icon selected">e5 </span>
  </div>
</div>
```

Key structure:
- One `.main-line-row` per full move number, `data-whole-move-number="N"`.
- Inside it, up to two `.node` divs: `.white-move` and `.black-move`
  (black's may be absent if the game just ended on white's move).
- `data-node="{rowIndex}-{plyInRow}"` — a stable per-ply id you can use as a dedupe
  key when diffing mutations.
- The actual SAN text lives in `.node-highlight-content` — note it has a **trailing
  space** in the text content (`"e5 "`), so `.trim()` it.
- The currently-active/just-played ply gets an extra `selected` class on the span.
  Useful if you ever want to detect "which ply is the user currently viewing" when
  they scrub chess.com's own move list, but not needed for our post-game scrape.

**Scraping algorithm** (after game end, one-shot — see below for why we wait):

```js
function scrapeSanMoves() {
  const rows = document.querySelectorAll('wc-simple-move-list .main-line-row');
  const sanMoves = [];
  for (const row of rows) {
    for (const cls of ['white-move', 'black-move']) {
      const node = row.querySelector(`.node.${cls}`);
      if (!node) continue;
      const span = node.querySelector('.node-highlight-content');
      if (span) sanMoves.push(span.textContent.trim());
    }
  }
  return sanMoves; // e.g. ["e4", "e5", "Nf3", ...]
}
```

Feed `sanMoves` into `chess.js` one at a time (`chess.move(san)`) to reconstruct
every position, get FEN per ply, and export a real PGN via `chess.pgn()`.

## 3. Game-over detection

When the game ends, chess.com mounts a modal:

```html
<div class="board-modal-container-container game-over-modal-entering">
  <div class="board-modal-component">
    <div class="game-over-modal-shell-container">
      <div class="game-over-modal-shell-content">
        <div class="game-over-modal-header-component game-over-modal-header-whiteWon">
          <div class="game-over-modal-header-inner">
            <div class="game-over-modal-header-header">
              <div class="game-over-modal-title-component">Game Aborted</div>
              <div class="game-over-modal-subtitle-component">
                <div class="game-over-modal-subtitle-first-line">...</div>
              </div>
            </div>
          </div>
          <button aria-label="Close" class="...game-over-modal-header-close">
        </div>
        <div class="game-over-modal-shell-buttons">
          <button class="...game-over-new-game-button-component">
        </div>
      </div>
    </div>
  </div>
</div>
```

The load-bearing selector is:

```
.game-over-modal-header-component
```

Its class list carries a **result suffix** appended to the base class —
we observed `game-over-modal-header-whiteWon` in our test game. Expect siblings
like `-blackWon` / `-draw` (or similar; only whiteWon was captured directly since
our bot game ended in a somewhat degenerate "Game Aborted" resign-with-one-move
state — worth re-verifying the exact suffix strings on a *real* checkmate/draw game
before shipping, e.g. by playing a bot down to actual mate).

`.game-over-modal-title-component` holds the human-readable headline text
("Checkmate", "Game Aborted", etc.) and `.game-over-modal-subtitle-component` holds
the reason line (e.g. "by resignation").

**Detection strategy:**

```js
const observer = new MutationObserver(() => {
  const header = document.querySelector('.game-over-modal-header-component');
  if (header) {
    observer.disconnect(); // one-shot; game is over
    onGameOver();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
```

Watching `document.body` with `subtree: true` is broad but fine for a one-shot
"did this modal appear" check — the alternative (finding a narrower, stable parent
container to observe) is more fragile to future markup shuffles.

## 4. Resign flow (only relevant for our own manual testing, not the extension)

- Resign button: `button[aria-label="Resign"]`
- This opens a confirmation prompt ("Are you sure you want to resign?") with a
  second button whose visible text is literally `Resign` (no distinguishing class
  found — matched by `button.textContent.trim() === 'Resign'`).

## 5. Open questions / things to re-verify later

- Confirm the exact `game-over-modal-header-*` suffixes for **checkmate**, **draw**,
  **timeout**, and **opponent resigns** (we only captured the abort/resign case).
- Confirm whether the *live* (real, rated) game page at `chess.com/game/live/...`
  uses the exact same `wc-simple-move-list` / `game-over-modal-*` component names as
  the vs-bot page at `chess.com/play/computer` — they likely share the same
  underlying board package (`chessboard-pkg-move-list-component` class hints at a
  shared internal package), but should be re-confirmed on a real live game before
  relying on it.
- Check behavior for games with **takebacks/annotations** in the move list — extra
  `<div>` siblings (e.g. annotation icons, clock timestamps) may appear inside
  `.main-line-row` alongside the two `.node` divs; the scrape function above already
  guards against this by explicitly querying `.node.white-move` / `.node.black-move`
  rather than assuming fixed child ordering.
