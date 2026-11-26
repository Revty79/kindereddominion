# Kindred Dominion

Version **0.1.0** · Stage **V1.1 — Playable Foundation**

A standalone, local browser tactical card game. Play against another person on the same screen or a basic computer opponent. Includes 30 provisional cards, four legal 15-card decks, a custom deck builder, Classic and Domination scoring, and configurable battlefields.

## Start on Windows

Dependencies are already installed in this workspace. Double-click **`Start Kindred Dominion.cmd`**, or open PowerShell and run:

```powershell
cd D:\kindereddominion\kindred-dominion
npm run dev
```

Open **http://127.0.0.1:5173/** in your browser. Keep the terminal open while playing. To stop, focus that terminal and press **Ctrl+C**; confirm with **Y** if Windows asks to terminate the batch job.

On a fresh computer, install Node.js 22.12+ (24 recommended), then run `npm ci` once in the project directory. This installation requires internet access. Local gameplay uses no external services or internet requests. Do not open `index.html` directly from Explorer: use the local server.

Port 5173 is fixed: if it is already occupied, stop the application using that port before starting this one. The server binds only to this computer. Always use the same browser and address to recover local saves; `localhost` and `127.0.0.1` have different browser storage.

## Play a match

1. Choose Classic or Domination, an opponent, and a deck for each player. The four supplied decks are legal in Standard Play with mixed collections.
2. Begin the match. Select zero to five opening cards to exchange, then confirm. In local two-player mode, pass the screen whenever the private handoff appears.
3. Select a card in your hand. Illuminated positions are legal. Select a position to review influence and the resolved ability chain, then press **Place at …**.
4. Standard creatures need empty friendly territory with enough tokens for their rank. Replacement sacrifices an eligible creature; evolution needs its stated predecessor. Tokens and fortification remain underneath creatures.
5. Pass if you wish, or confirm a forced pass when no placements are legal. You can resume playing later. Two consecutive passes end the match; full boards and empty draw piles do not.
6. Review final scores and choose Rematch (alternates the starting player) or New match setup.

In Classic, each winning row awards its full surviving power; tied rows award zero. Domination adds one point per surviving creature. Vertical creature counts appear below every column in Domination.

Matches save after every action when browser storage is available. Reload and choose **Continue saved match**. Custom deck drafts also save locally. Only one match is retained; beginning a new match replaces it. Local saves and development exports contain both hands; the privacy curtain is screen privacy, not encryption. Storage failure is reported and does not prevent a session from being played.

Use **Card library** to read all definitions and influence patterns, **Build deck** to choose your own 15 cards, and **Graveyard** to inspect discarded or exiled instances. Standard defaults to two copies, with explicit three-copy overrides on Briar Sprout, Embercub, Rune Initiate, Bone Thrall and Brass Scout. Free Play permits up to 15 copies without disabling universal effect limits. A single collection currently contains only six definitions; use Free Play for a 15-card single-collection deck.

## Project structure

```text
src/
  engine/
    types.ts        Serializable state, instances, triggers and effects
    config.ts       Battlefield and safeguard defaults
    game.ts         Deterministic rules, actions, resolution and invariants
    scoring.ts      Extensible tactical scoring registry
    ai.ts           Local, deterministic one-ply computer opponent
  data/
    cards.ts        30 data-driven provisional definitions
    decks.ts        Four legal test decks
  ui/
    App.tsx         Setup, library, match, previews and private handoffs
    storage.ts      Versioned browser-local persistence
    styles.css      Responsive presentation using system fonts
  main.tsx          React entry point
tests/
  engine.test.ts    Unit and full-match engine integration coverage
  browser/         Actual Chromium UI gameplay tests
docs/
  RULES-AND-ARCHITECTURE.md
  TEST-CARDS.md
  VALIDATION.md
```

The engine imports no React, DOM, storage, network or clock APIs. `createMatch` takes explicit configuration and a seed. `act` validates an action, clones its input, resolves it completely, and returns the new state. The UI and computer use the same legal-action checks. A future authoritative server can own these same state transitions; this stage adds no server or multiplayer infrastructure.

## Checks and production build

```powershell
npm run typecheck
npm test
npm run build
```

For reproducible browser checks (the browser installation is only a development dependency):

```powershell
npx playwright install chromium
npm run test:browser
```

The browser suite starts the local server if necessary and otherwise reuses it. Build output is `dist/`. To try the production build, stop the development server, run `npm run preview`, and open the same local address. Screenshots, traces, dependencies and build artifacts are ignored by Git.

See [rules and architecture](docs/RULES-AND-ARCHITECTURE.md) for gameplay assumptions, [test cards](docs/TEST-CARDS.md) for definitions and deck identities, and [validation](docs/VALIDATION.md) for results and limitations. These cards are test material, not approved commercial definitions. V1.2 and subsequent stages are outside this implementation.
