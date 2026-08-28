-- The availability grid becomes seven days by five blocks.
--
-- ADR-0006 settled four blocks -- early morning, midday, afternoon, evening -- and
-- rejected three on the grounds that an early coffee and a lunch meeting are not the
-- same answer. The same argument reaches one block further: mid-morning is not
-- midday, and collapsing them asks a person free at 10am and a person free at 1pm to
-- give the same answer and then counts them as having met.
--
-- Added by value rather than by replacing the type, so a stack that has already
-- applied ticket 03 gains the block without rewriting intake_availability. `before
-- 'midday'` keeps the enum in the order the grid is drawn in, which is the order the
-- form renders and the overlay on the Leader Dashboard will draw.
--
-- Safe to do now and not later: no pilot has collected availability yet. Once one
-- has, this migration has no correct automatic answer -- a person who selected
-- "midday Tuesday" under the four-block grid cannot be asked retrospectively whether
-- they meant mid-morning. See docs/adr/0006-the-availability-grid.md.

alter type day_block add value if not exists 'morning' before 'midday';
