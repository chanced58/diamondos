# Dark mode: visual check before release

The build was verified by tests, type-check, lint, the production web build and code review. Nothing behind sign-in has been looked at rendered. Local Supabase wasn't available, and nothing was signed in against the hosted project. Walk this list signed in, once in **Dark** and once in **Dugout**, before merging each PR. System is the default, so dark-OS users get Dark on update without opting in.

## Web (`feature/dark-mode`)

How to switch: Settings → Appearance, or `localStorage.dos_theme = 'dark' | 'dugout' | 'system' | 'light'` and reload.

- **No flash.** Hard-reload `/dashboard` in System (OS dark), Dark and Dugout. There should be no light flash. Click from `/dashboard` to a public league page (`/l/<slug>`) and back. The league page stays light, and switching between them doesn't flash.
- **Stays light.** `/`, `/login`, `/l/<slug>`, `/l/<slug>/team/<id>`, `/p/<id>`, `/leagues`. The scorer content at `/games/<id>/score` and `/games/demo` stays light inside a dark sidebar.
- **Printing in Dark.** Print any signed-in page, such as a roster or lineup. The output is dark text on white.
- **Shadow-only modals.** The surface should read lighter than the dimmed page. Check the guest player modal (`/games/[id]/lineup`), the bullpen pitcher picker (`/practices/[id]/plan`), the drill picker (`/practices/templates`), and the add/release/trade dialogs (`/league/admin/players`).
- **Dark-fill chips.**
  - RSVP "Can't go" on `/games/[id]`.
  - Selected season chips on `/analytics/practice-volume`.
  - The `/admin/setup` submit button.
- **Logos on dark tiles.** Team logo preview in `/teams/[id]/admin`, league logo in `/league/setup`, and the `/admin` team list.
- **Focus rings.** Tab through a form. Rings should be clearly visible. The start-game toggle on `/games/[id]` shows a known white focus halo.
- **New tinted pills.** `/bullpen`, `/practices/[id]/plan`, `/practices/drills`. Also check the slate forms and the Save / Add category buttons on `/league/admin`.
- **Branding.** Team colors show in the sidebar in Light only. `/admin/branding` preview reads as Light inside the dark card.

## Mobile (`feature/dark-mode-mobile`, needs a native rebuild: `expo run:ios`)

How to switch: More → Appearance.

- **Cold start** in System (simulator dark), Dark and Dugout. There should be no light flash after the splash.
- **System follows the OS.** In System, flip the simulator light/dark and the app follows. Background the app and resume it: no theme flash. With Dark chosen, flipping the simulator changes nothing.
- **Light on a dark-OS phone.** Keyboard, date pickers, Switch, Alerts and scroll indicators are all light, as they were before.
- **Scorer while the app is Dark.**
  - Scoring content, the BaserunnerDisplay sheet, guest and lineup inputs (light keyboard) and the pitch-input modals all stay light.
  - The header, tab bar and status bar are dark.
  - Alerts over the scorer are dark; that's accepted.
  - Scroll bars in the pitch-input modals may be white when content overflows; known follow-up.
- **Sign out.** The sign-in screen is light.
- **Live view** (parent): themed scoreboard, bags and field on a dark card.
- **Lineup "+ Guest" sheet** in Dark: dark sheet and dark keyboard. The same modal opened from the scorer is light.
- **Home.** Next-up card text, live-game card, refresh spinner.
- **Schedule.** Calendar selected day, RSVP "Out" chip, date and time pickers, and Switches on new event and new game.
- **Messages.** Bubbles, composer placeholder and keyboard, league channel send button.
- **Stats.** Selected filter chips (`bg-gray-900`), tables.
- **More.**
  - Roster forms and date pickers.
  - Invites (ChildrenPicker chips).
  - Practices: plan modal, AI chips, notes.
  - Facilities chips.
  - Tournaments: pickers and Switches.
  - Opponents: player sheet.
  - League home and team heroes: white-on-blue text and season pills.
  - League-admin Switches.
  - Training radio dots.
- **Performance.** Open a large stats table in Dark and compare against main. It should feel no slower.
