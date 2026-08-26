# 07 — The scheduled tick, follow-up items, and Care Needed

**What to build:** A relationship nobody has accepted stops being invisible. Two days after creation the Leader is reminded. Five days after creation it surfaces to the Admin in the Care Needed view along with how long it has been waiting, so they can intervene. The Admin can cancel it, so people are never held out of the pool by a decision nobody made.

This ticket introduces two shared mechanisms, and both are load-bearing for everything after it.

The **scheduled tick** is a command like any other: it enters through the same boundary, reads the injected clock, and returns effects. It never reads system time.

A **Follow-Up Item** is a condition requiring Admin review. It is never cleared by the event that raised it and never clears itself; it persists until an Admin acts on it. This is the property that makes Care Needed trustworthy — nothing that needs a decision disappears before someone makes it.

Cancelling an unaccepted relationship returns everyone in it to the suggestion pool.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] A scheduled tick enters through the command boundary and reads the injected clock
- [ ] An unaccepted relationship reminds its Leader at two days
- [ ] An unaccepted relationship raises a follow-up item at five days showing how long it has waited
- [ ] A follow-up item never clears itself and is not cleared by the event that raised it
- [ ] An Admin can cancel an unaccepted relationship, returning everyone to the suggestion pool
- [ ] Accepting before the thresholds means no reminder and no follow-up item
- [ ] Care Needed lists open follow-up items for the Admin's Ministry only
