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

Step 1-2 of the build only: the content script detects game-over and logs the
scraped SAN move list to the console. No chess.js, no engine, no UI yet.

## Try it now

1. Open `chrome://extensions` in real Chrome.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this `chess-analyzer` folder.
4. Go to `chess.com/play/computer`, play (or resign) a quick game.
5. Open devtools console on that tab — you should see:
   - `[chess-analyzer] content script loaded, watching for game end`
   - `[chess-analyzer] Game over detected {...}`
   - `[chess-analyzer] Scraped SAN moves: [...]`

> Note: this repo's automated browser tooling can't load unpacked extensions,
> so testing has to happen in your own Chrome via the steps above.

## Roadmap

- [x] Manifest + content script scaffold
- [x] Game-over detection via `.game-over-modal-header-component`
- [x] One-shot SAN move-list scrape
- [ ] Vendor `chess.js`, rebuild FEN/PGN from the SAN list
- [ ] Inject "Analyze Game" button + results panel UI
- [ ] Vendor Stockfish WASM build, run it in a Web Worker with MultiPV
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

MIT (or your choice — this is your project, update this section).
