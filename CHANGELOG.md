# Changelog

Versions are `major.minor.patch`. A round of new features raises the minor number,
a fix raises the patch. The number lives in `package.json` and each release is
tagged `vX.Y.Z`.

## 1.3.0 (2026-11-27)

- Music by the time of day: a route theme in the morning, a lo-fi cafe tune in
  the afternoon and a music box waltz at night, with the battle tune in fights.
  Tunes fade into each other and loop without a gap.
- Music and Effects each have a volume slider on Options. The clicks in the
  music and effects are gone.
- The town map is a town: streets, trees and a pond, with a building for each
  screen and your partner at the door of the one you are on. Arrow keys walk it.
- The start menu fits on screen without scrolling, on phones too.
- Pokemon (accounts): the picked account has its own panel with the month's
  figures, beside only its transfers. Archive asks first and offers Restore.
- Bill's PC shows the picked bill as facts beside what is due this month.
- Pokegear stacks its panels in two columns that leave no gap.
- Three monthly quests on the trainer card: pay every bill on time, log on 15
  days, spend less than last month.
- The Bag lists items with this month's totals beside the picked item.
- Home's latest entries end where the scene ends and scroll inside.
- No database change.

## 1.2.0 (2026-11-23)

- A pixel coin is the app's mark: browser tab, phone home screen and header.
- A Home button in the header, and room between the header buttons.
- Spent and Earned ask How much, Category, What for and the account. The
  category opens as a grid in a pop-up, on Home, Log and the bill form, and
  starts on the one used last. What for suggests past notes and their category.
- Undo and Toss keep the entry or transfer for 30 days. Restore it from the
  message, or from Tossed lately on Log. A tossed entry counts in no total.
- New menu music.
- Wide windows use the room: a wider page, two columns on most screens and more
  space around windows and buttons. Cut-off names and notes now wrap.
- Fixes: the amount field takes the cursor every time a pop-up opens, and arrow
  keys move the cursor in text fields.
- Needs `supabase/migrations/0004_tossed.sql` on the database.

## 1.1.0 (2026-11-20)

- Home opens on one account: balance, spent and saved for the month, a daily
  balance line and where the spending went. One tab per account, plus All.
- Spent, Earned and Move open as pop-ups on Home.
- Income dated from the 25th counts as pay for the next month.
- The scene is compact by default and still animated.
- Sign in with a password; the emailed link stays as a fallback.
- Hosting config for Vercel: region and security headers.

## 1.0.0

- Everything before 1.1: logging, accounts, bills, statement import, charts,
  battles, the expedition and the game-style menus and pop-ups.
