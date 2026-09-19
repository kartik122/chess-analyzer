# Chess.com Post-Game Analyzer

A Chrome extension (Manifest V3) that reviews your chess.com game with a
client-side Stockfish engine **after the game ends** — no live-game move
suggestions, to stay clear of chess.com's fair-play rules.

Built as a learning project. See [`docs/DOM-NOTES.md`](docs/DOM-NOTES.md) for the
raw DOM research this is built on.

## How it works

1. **Content script** (`content/game-over-detector.js`) sits idle on
   `chess.com/*` pages. A `MutationObserver` watches for chess.com's own
   game-over modal to appear.
2. Once the game ends, the full move list is scraped in one pass (SAN moves,
   reading the real piece letter out of chess.com's icon-glyph
   `data-figurine` attribute rather than assuming plain text) and replayed
   through [`chess.js`](https://github.com/jhlywa/chess.js) to reconstruct
   every position (FEN per ply) and produce a real PGN.
3. The game is saved to `chrome.storage.local` immediately, and a message
   goes to **`background.js`**, a service worker, which is the only place
   that can turn the toolbar icon gold (`chrome.action` isn't available to
   content scripts at all). The toolbar's **popup** (`popup.html`) is the
   only "a game is ready" UI (an earlier on-page floating panel duplicated
   this and was removed) — its "Analyze Game" button opens **`analysis.html`**
   — a full page bundled in the extension, not an overlay injected into
   chess.com's own DOM — in a new tab. When a new game starts, the content
   script tells the background worker to turn the icon back to gray -- but
   the *data* in storage isn't touched until the next game actually
   finishes, so the popup can still offer "view last analyzed game" in the
   meantime.
4. `analysis.js` reads the saved game, builds a **move tree** (a rooted tree
   with parent pointers -- not literally "undirected": a move is inherently
   directional, one position to a specific next one, but you *can* walk it
   both ways via each node's `parent` reference), and renders the current
   node's position on a [`chessground`](https://github.com/lichess-org/chessground)
   board (the same open-source board lichess uses).
5. [Stockfish](https://github.com/official-stockfish/Stockfish) (compiled to
   WASM) runs in a Web Worker with `MultiPV 3`, so every node gets the top 3
   lines, not just the single best move -- drawn directly on the board as
   green/yellow/blue arrows via chessground's `setAutoShapes`. Results are
   cached **on the tree node itself**, so revisiting an already-analyzed
   position is instant, no re-running the engine.
6. Arrow keys (or the tree sidebar, or the `|< < > >|` buttons) walk the tree
   via parent/child pointers. Dragging a piece on the board plays a new move
   (validated through chess.js) from whichever node is current -- if that
   exact move already exists as a child, you're just retracing a line you've
   seen; if not, a brand-new child node (a variation/branch) is created.

## Current status

Fully wired end-to-end and verified (via a local test harness that mocks the
one `chrome.storage.local` call, so the real shipped `analysis.js` could run
standalone): move scraping, chess.js replay, the tree data structure,
chessground rendering, arrow-key/tree navigation, and Stockfish analysis with
per-node caching. Two real bugs were caught and fixed during that testing:

- The boot code was defaulting to the tree's **root** (starting position)
  instead of walking to the end of the main line, so the board opened on
  move 0 instead of the final position.
- Rapid navigation (e.g. holding an arrow key) could fire a new Stockfish
  search before the previous one finished. Since Stockfish only searches one
  position at a time, an overlapping request's listener could pick up
  `info`/`bestmove` lines that actually belonged to the older, still-running
  search -- producing nonsensical analysis for the wrong position. Fixed by
  serializing searches: a new request while one is active sends `stop` and
  queues itself, only actually starting once the engine's own `bestmove`
  confirms it's idle again.

Not yet built: promotion-choice UI (pawn promotions currently auto-queen),
and this hasn't yet been exercised inside a *real* loaded extension against
a live chess.com game -- only against the test harness.

## Try it now

1. Open `chrome://extensions` in real Chrome.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this `chess-analyzer` folder.
4. Go to `chess.com/play/computer`, play (or resign) a quick game.
5. Open devtools console on that tab — you should see:
   - `[chess-analyzer] content script loaded, watching for game end`
   - `[chess-analyzer] Game over detected {...}`
   - `[chess-analyzer] Scraped SAN moves: [...]`
   - `[chess-analyzer] Built FEN list: [...]` and `Built PGN: ...`
6. A small "Chess Analyzer" panel appears top-right. Click "Open Full
   Analysis" — a new tab opens with the board, engine lines, and move tree.
   Use ← → (or click a move in the tree, or drag a piece to branch) to
   navigate.

> Note: this repo's automated browser tooling can't load unpacked extensions,
> so testing has to happen in your own Chrome via the steps above.

## Vendoring Stockfish

`vendor/stockfish.js` + `vendor/stockfish.wasm` came from the `stockfish`
npm package (v19.0.0), specifically the `stockfish-19-lite-single` build:

- **single-threaded** — avoids the `SharedArrayBuffer` requirement that
  multi-threaded WASM builds need, which in turn needs
  `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` response headers
  on the page. chess.com doesn't send those, and we can't add them since we
  don't control chess.com's server — so a multi-threaded build simply
  wouldn't load there.
- **"lite"** — a smaller NNUE evaluation network, trading a little playing
  strength for a much smaller download (~1.8MB `.wasm` vs. ~99MB for the
  full-strength single-threaded build).

The two files must share the same basename — the glue script derives its own
`.wasm` URL by taking its own script location and replacing `.js` with
`.wasm`, so both were renamed to `stockfish.js` / `stockfish.wasm` on copy.
Verified standalone (outside the extension, via a local static server) with
a raw UCI handshake and a `MultiPV 3` search before wiring it in — confirmed
`uciok`/`readyok`, real `info depth ... multipv N ... pv ...` lines, and a
final `bestmove` line, matching exactly what `analyzePosition()` in
`content/game-over-detector.js` expects.

`vendor/STOCKFISH-LICENSE.txt` is Stockfish's GPLv3 license text, copied
alongside the binary — see the License section below.

## Vendoring chessground

`vendor/chessground/` came from the `chessground` npm package (v9.2.1):

- `chessground.js` — copied from the package's `dist/chessground.min.js`, a
  single self-contained ESM bundle (no build step needed, unlike chess.js;
  confirmed it has no external `import`s, only `export { Chessground,
  initModule }`).
- `chessground.base.css` — core board/piece layout structure (required).
- `chessground.brown.css` — a board color theme (square colors).
- `chessground.cburnett.css` — a piece theme; the classic lichess default
  set. The actual piece artwork is embedded as base64-encoded SVG `url(...)`
  data directly inside this CSS file, so there are no separate image files
  to vendor.

chessground is also GPL-3.0-or-later (same license family as Stockfish —
both are part of the lichess/Stockfish open-source ecosystem) — see the
License section.

## Toolbar icon + popup

- `icons/icon-gray.svg` / `icons/icon-gold.svg` are the source vectors; the
  actual knight silhouette paths are lifted from chessground's own vendored
  `cburnett` piece set (`vendor/chessground/chessground.cburnett.css`, base64
  SVG for `piece.knight.black`) rather than hand-drawn, since we already had
  rights to that artwork locally and it's higher quality than anything drawn
  from scratch. Rasterized to 16/32/48/128px PNGs (`icons/icon-{gray,gold}-*.png`)
  with `sharp`, since no SVG rasterizer (ImageMagick, rsvg-convert, Inkscape)
  was available as a system command on this machine — `convert` on Windows
  resolves to the OS's disk-conversion utility, not ImageMagick.
- `manifest.json`'s `action.default_icon` and top-level `icons` both start
  pointing at the gray set; `background.js` swaps to the gold set via
  `chrome.action.setIcon()` on a `"chess-analyzer:game-over"` message, and
  back to gray on `"chess-analyzer:game-active"` (sent from the content
  script's `MutationObserver` on the falling edge -- header was showing, now
  it's gone -- so it fires exactly once per new game, not on every unrelated
  mutation while no modal is up).
- `background.js` also mirrors the icon state into `chrome.storage.local` as
  `readyToAnalyze`, since that's the only way `popup.html` (a separate page,
  with no direct access to what the icon currently looks like) can know which
  content to show.
- `popup.js` reads `readyToAnalyze` + `lastGame` and renders one of two
  states: a gold "Ready to analyze" card with the result and an "Analyze
  Game" button, or a neutral "no game yet" card that still offers "View last
  analyzed game" if `lastGame` exists from an earlier game. The popup's own
  `×` button just calls `window.close()` -- clicking outside the popup or
  pressing Escape already dismisses it natively, so this is purely an
  explicit affordance for anyone who prefers clicking a visible close control.
- Unlike the content script, `popup.html` is a full extension page, so
  `popup.js` can call `chrome.tabs.create()` directly -- no `window.open`
  workaround needed there.

## Roadmap

- [x] Manifest + content script scaffold
- [x] Game-over detection via `.game-over-modal-header-component`
- [x] SAN move-list scrape (including correctly reading piece letters from
      chess.com's icon-glyph `data-figurine` attribute, not just text)
- [x] Vendor `chess.js`, rebuild FEN/PGN from the SAN list
- [x] Vendor Stockfish WASM build (verified standalone with MultiPV)
- [x] Vendor `chessground`
- [x] Dedicated `analysis.html` page (opened in a new tab) instead of an
      in-page overlay
- [x] Move tree (rooted, parent-pointer) data structure with branching
- [x] Board + arrow-key/tree-click navigation, wired to the tree
- [x] Stockfish analysis per node, with per-node result caching
- [x] Green/yellow/blue arrows on the board from the top-3 engine lines
- [x] Move input on the board (drag a piece to create/follow a branch)
- [x] Toolbar icon (knight) that turns gray→gold on game completion, via a
      background service worker
- [x] Popup UI reflecting ready/idle state, with a close button (on-page
      floating panel removed as redundant with it)
- [x] Evaluation bar (chess.com/lichess-style win-probability bar) next to
      the board, driven by the best line's score
- [ ] Promotion-choice UI (currently auto-queens)
- [ ] Exercise the whole flow inside a real loaded extension against a live
      chess.com game (verified so far only via a local test harness)
- [ ] Verify `game-over-modal-header-*` result-suffix values for checkmate/draw/timeout (currently only confirmed for the resign/abort case — see Open Questions in DOM-NOTES.md)
- [ ] Verify the same selectors hold on a real `chess.com/game/live/...` page, not just `play/computer`

## Why post-game only, and why DOM scraping instead of the live API

- Chess.com's fair-play policy prohibits real-time engine assistance during a
  game. Restricting all analysis to after the game-over modal appears keeps
  this tool squarely in "post-game review" territory, the same category as
  chess.com's own built-in "Game Review" feature.
- Chess.com does have an internal, undocumented WebSocket API that its own
  client uses for live game state, but it's private, unversioned, and using it
  risks both breakage and ToS issues. DOM scraping of the move list (which is
  already-public, already-rendered markup) is more stable to build against and
  is what most open-source chess.com tooling in this space actually does.

## License

MIT for this project's own code (or your choice — update this section).

Note: Stockfish and chessground are both licensed **GPLv3**
(`vendor/STOCKFISH-LICENSE.txt`; chessground doesn't ship a bundled license
file in its npm package, but its `package.json` declares
`GPL-3.0-or-later`). That's a copyleft license — since you're distributing
their compiled/bundled code as part of this extension, keep the extension
itself open source to stay compliant. This doesn't affect chess.js (MIT) or
your own code, only these two components specifically.
