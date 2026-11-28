# Gameplay Correction 01 — Immediate card placement

Owner direction, 2026-11-27. Included in the V1.6G gameplay release; separate from store development.

Selecting a card and clicking or tapping a legal battlefield tile, or dragging and releasing it there, submits the authoritative placement immediately. Remove the placement confirmation dialog, secondary confirmation controls and confirmation-mode choice. Preserve floating artwork, pre-placement tactical previews and affected-tile highlighting, placement/effect animations, cancellation or changing selection before commitment, and server validation. Illegal destinations must not submit or advance the turn. Overlapping pointer/click/drag events must not duplicate a move. Preserve delay, rejection and interrupted-response recovery. Committed moves have no undo; gameplay rules remain unchanged.

Acceptance covers immediate legal click, drop and native touch placement; pre-commit previews; illegal/cancelled attempts; delayed/rejected/lost responses; exactly-once submission; opponent presentation and turn progression; complete gameplay and economy regression.
