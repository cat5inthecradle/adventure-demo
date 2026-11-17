# Privacy and student data

What Adventure Lab stores, what leaves the browser, and what is still undecided.
Written for a privacy reviewer and for anyone answering the release checklist.
Last checked against the code on 2026-11-16.

## The two checklist questions

> If students or teachers are an audience, a data-privacy review happened (link it in this PR).

**Not yet.** Students and teachers are the audience, and no data-privacy review has
happened. This document is the input for one. When a review happens, link it here
and in the release request.

> No real student data is stored (spec §6, §10).

**True today.** The app has no server, no account, no sign-in of its own and no
analytics. It sends nothing a student types anywhere. What a student types stays
in that browser, on that device, and is listed below.

That answer depends on the app not logging play. Logging is being considered (see
[Logging playthroughs](#logging-playthroughs-proposed-not-built)), and it is the
question a review must settle before this is submitted as a real Hour of AI
activity.

## Where free text goes

Students type free text in five places. None of it leaves the device unless the
student moves it themselves.

| What the student types | Where it is kept | How long |
|---|---|---|
| Game commands in the terminal | In memory only | Until the page is reloaded or the level changes |
| The thing they add in "Make it real": name, description, other names | Browser storage (`localStorage`) | Until the browser's site data is cleared |
| The reason, tone and theme on the AI dial | Browser storage, once they press **Save my setting** | Until the browser's site data is cleared |
| The reasons on "Set the dial for real life" | Browser storage | Until the browser's site data is cleared |
| Their name on the "My AI rules" card | Nowhere. The name line is blank on screen and is filled in by hand on paper | — |

Two ways a student can move their own text off the device, both by their own action:

- **Download log**, a small link under the terminal, saves a JSON file to the
  device. It holds every command they typed and every reply in that game, their
  dial setting and reasons, the page address and the browser's user-agent
  string. The app does not upload it. A student could hand the file to someone.
- **Print my card** prints the card, with whatever they wrote on it.

## Everything the app keeps in the browser

All of it is `localStorage` on the site's own origin. There are no cookies.

| Key | What it holds |
|---|---|
| `adventure-lab:lesson-world` | Which of the three worlds the student chose |
| `adventure-lab:lesson-passed` | Which lesson levels they have passed |
| `adventure-lab:lesson-dial` | Their saved AI dial setting, tone, theme and reason |
| `adventure-lab:lesson-real-life` | Their setting and reason for each of the three apps |
| `adventure-lab:project:…` | The lesson world with the thing they added, one per world |
| `adventure-lab:save:…` | Game positions saved with the `save` command in the Play view |
| `adventure-lab:world` | An edited world for the Play view. Nothing writes this any more; it is read if an older version left one |

`web/tests/privacy.test.js` fails if the code starts using a key that is not in
this table.

If a student picks an AI model, the browser also caches the model's files, as the
WebLLM library does by default. Those are public files, not student data.

**Known gap: shared devices.** Browser storage outlives the student's turn at the
keyboard. On a shared Chromebook or a shared browser profile, the next student
would see the previous student's added thing, dial reason and real-life reasons.
There is no "clear my answers" button yet. Most school Chromebooks give each
student their own profile, which avoids this, but the app does not rely on that.

## What leaves the browser

The app's own code makes no network requests. `web/tests/privacy.test.js` fails
if `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, cookies or
geolocation appear in `web/src/`, or if `index.html` loads anything from another
site.

Requests the browser does make:

| Request | To | Carries |
|---|---|---|
| The page, its scripts, styles and fonts | The site that hosts Adventure Lab | What any page load carries: IP address, user-agent |
| The AI model's files, only when a student picks a model | `huggingface.co` and `raw.githubusercontent.com`, by the WebLLM library | IP address and user-agent. Nothing the student typed |

The AI model runs in the browser. Prompts, the student's sentences and the
model's replies stay on the device.

Things a reviewer should know that this repository does not control:

- **Hosting logs.** The site is a static site on CodeAI Cloud. Whatever the
  hosting layer logs for a page request (typically IP address, time, address,
  user-agent) is the platform's, not the app's. What is logged and for how long
  has not been confirmed with cloud-ops.
- **Sign-in on the internal site.** `adventure-lab.internal.code.org` is behind
  code.org sign-in, so the platform knows who opened it. The app is static files
  and never sees that identity. The public site has no sign-in.
- **Model downloads go to third parties.** A student who picks a model contacts
  Hugging Face and GitHub directly. Hosting the model files on the app's own
  site would remove that, and would also help with school network filters.
- **The Hour of AI tracking pixel.** Accepted Hour of AI activities are asked to
  load a 1-pixel image from Code.org on the first activity page, which Code.org
  uses to count starts and, by its own description, to place participants by
  city, state and country from their IP address. It is not in the app. Adding it
  would be the first thing in the app that reports a student's visit to anyone.

## Logging playthroughs (proposed, not built)

There is no logging today. This section records what is being considered so a
review can rule on it before any of it is built.

**Purpose.** Find where students get stuck and improve the lesson: which
commands fail, which levels are skipped, how long each level takes.

**The author's position.**

- A playthrough is never tied to a person. No name, account, email or sign-in.
- No IP address is stored with a playthrough, and none is used to work out
  location.
- No identifier follows a student from one session to the next. Two visits by
  the same student are two unrelated playthroughs.
- Logs are used to improve the lesson and for nothing else.

**Why it still needs a review.** The lesson accepts free text. A student can type
anything into the terminal or a reason box, including their own name, a
classmate's name, or something personal. A log of raw typed text is therefore a
log that can contain personal information about a child, even when nothing else
identifies them. That is the question for the review.

**Questions for the review to answer.**

1. May typed text be logged at all, or only what the game made of it (the command
   it became, or the kind of failure)? Logging only the structured result keeps
   most of the value for finding sticking points and none of the free text.
2. If typed text may be logged: which fields (game commands only, or also the
   reasons and the added thing's description), with what filtering, and kept for
   how long?
3. Does the server receiving the logs keep IP addresses in its own request logs,
   and if so can that be turned off, so that "no IP address" is true of the whole
   path and not only of the app?
4. What do students, teachers and families need to be told, and where?
5. Does the Hour of AI tracking pixel fit the position above, given that it uses
   IP addresses for location?
6. What applies to students under 13, given that the lesson targets ages 13 to 18
   but nothing stops a younger student opening it?

Until a review answers these, the app does not log, and the checklist answer
above stays true.

## How to check this document against the code

```bash
cd web
npm test -- privacy
```

The test covers the network and storage claims. The tables in this file are kept
by hand: when a new field stores something a student typed, add it to
[Where free text goes](#where-free-text-goes).
