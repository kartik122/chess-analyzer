# Chess.com Post-Game Analyzer

A Chrome extension (Manifest V3) that reviews your chess.com game with a
client-side Stockfish engine **after the game ends** — no live-game move
suggestions, to stay clear of chess.com's fair-play rules.

Built as a learning project. See [`docs/DOM-NOTES.md`](docs/DOM-NOTES.md) for the
raw DOM research this is built on.

## How it works (planned end state)

1. Content script sits idle on `chess.com/play/*` and `chess.com/game/*` pages.
2. A `MutationObserver` watches for chess.com's own game-over modal to appear.
3. Once the game ends, the full move list is scraped in one pass (SAN moves)
   and replayed through [`chess.js`](https://github.com/jhlywa/chess.js) to
   reconstruct every position (FEN per ply) and produce a real PGN.
4. An "Analyze Game" button appears. Clicking it starts
   [Stockfish](https://github.com/official-stockfish/Stockfish) (compiled to
   WASM) in a Web Worker, run with `MultiPV` so we get the top few lines per
   position, not just the single best move.
5. A [`chessground`](https://github.com/lichess-org/chessground) board (the
   same open-source board lichess uses) renders the game. Arrow keys step
   through the move list; the best move is drawn as a green arrow, the
   second-best as a lighter/yellow arrow.

## Current status

- Move-list scraping, chess.js replay (FEN + PGN), the on-page "Analyze Game"
  panel, and arrow-key ply navigation are all working end-to-end against real
  games.
- Stockfish is vendored (`vendor/stockfish.js` + `vendor/stockfish.wasm`,
  the single-threaded "lite" WASM build) and verified standalone (full UCI
  handshake, MultiPV output) — see "Vendoring Stockfish" below. It's wired
  into `analyzePosition()` in the content script but not yet exercised
  end-to-end through the actual "Analyze Game" button on a live chess.com
  game — that's the next thing to test.
- Still missing: `chessground` board rendering and the green/yellow arrow
  overlay (currently the panel shows position data as plain text).

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
6. A small "Chess Analyzer" panel appears top-right. Click "Analyze Game",
   then use ← → to step through the game.

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

## Roadmap

- [x] Manifest + content script scaffold
- [x] Game-over detection via `.game-over-modal-header-component`
- [x] SAN move-list scrape (including correctly reading piece letters from
      chess.com's icon-glyph `data-figurine` attribute, not just text)
- [x] Vendor `chess.js`, rebuild FEN/PGN from the SAN list
- [x] Inject "Analyze Game" button + results panel UI
- [x] Arrow-key ply navigation
- [x] Vendor Stockfish WASM build (verified standalone with MultiPV)
- [ ] Exercise Stockfish end-to-end through the real "Analyze Game" button
- [ ] Vendor `chessground`, render board + arrow-key move navigation
- [ ] Draw green/yellow arrows from the top-2 engine lines per ply
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

Note: Stockfish itself is licensed **GPLv3** (`vendor/STOCKFISH-LICENSE.txt`).
That's a copyleft license — since you're distributing its compiled WASM
binary as part of this extension, keep its license text included (already
done) and keep the extension itself open source, to stay compliant. This
doesn't affect chess.js (MIT) or your own code, only the Stockfish component
specifically.
