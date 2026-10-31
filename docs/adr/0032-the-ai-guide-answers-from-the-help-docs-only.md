# The AI Guide Answers From the Help Docs Only

## Status

accepted

An exception to *speculative AI recommendations* in `docs/non-goals.md`, which stays a non-goal for everything else.

## Decision

**Admins get an AI help assistant, Ask Discipler, that answers questions about using Discipler from the help docs and from nothing else.**
James decided it in the grilling and approved its screens and words in the mock-up 4 review (2026-10-31).

- It never sees any church's data: no names, no Roster, no check-ins, no Concerns, no settings.
  Asked about a person, it says it cannot see anyone in the church and points to the page that shows them.
- It has no tools, so it can change nothing and look nothing up.
- Its replies are text with links to help pages only, never HTML or images, and each answer ends with a link to the Help center page it came from.
- It runs on Claude Sonnet 5.5 through the Vercel AI Gateway, with zero data retention required, so a provider that would keep the text is never used.
- Each Admin may ask a limited number of questions a day, and the gateway spend has a monthly ceiling.
- Chats are kept per Admin, readable only by the Admin who wrote them, and deleted after a fixed time.
  Logs never carry chat text.
- It sits only on the signed-in Admin dashboard: never on sign-in or sign-up, never for anyone without an account, and not on Leaders' pages in this launch.

## Context

`docs/non-goals.md` lists *speculative AI recommendations* among the features that need explicit approval, and the product guardrail rules out a speculative AI scoring system.
Both are about AI deciding things about people: who fits whom, who is at risk, who matters.

A new church signing itself up at a conference has nobody at Discipler beside it.
The help docs answer most first questions, but a pastor setting up on a phone at night asks in their own words, and a search box answers only the words it indexed.

## Considered options

**No AI; a search over the help docs.**
Kept as well as the guide: search is a directory of pages, and the Help center is the source the guide answers from.
On its own it was rejected, because it answers *where is the page* and not *how do I*.

**An assistant that can see the church's data and answer about it.**
Rejected.
It would read Concerns and people's answers into a third party's model, it would be the speculative AI recommendation the non-goals refuse the moment it said anything about a person, and Ministry isolation would rest on a prompt.

**An assistant with tools that act in the dashboard.**
Rejected.
Every act in Discipler goes through the command boundary with an Admin behind it, and an assistant that acts is an actor the product does not have.

## Consequences

**The cost is a third party.**
What an Admin types is sent to Anthropic through Vercel, and an Admin may paste a name or a prayer request however clearly the box asks them not to.
That is accepted because nothing is retained by the provider, the chat is deleted on Discipler's side after a fixed time, nobody but its author can read it, and the box says under it: "Please don't paste names, phone numbers or prayer requests."
The privacy policy names both providers.

An answer can be wrong.
Because each one links to the help page it came from, the page is always one press away, and the help docs stay the source of truth.

The daily limit, the retention time and the spend ceiling are the spec's numbers and live where ticket 31 enforces them.

This ADR is the approval `docs/non-goals.md` asks for, and it approves this assistant only.
An AI that suggests pairings, scores relationships or reads a church's data is still a non-goal, and would need its own decision.
