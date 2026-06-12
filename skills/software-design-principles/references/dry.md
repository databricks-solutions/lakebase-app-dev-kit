# DRY – Don't Repeat Yourself

One canonical home per piece of knowledge (a fact, rule, or computation). Encode it twice and the copies drift; one goes silently wrong.

DRY is about duplicate **knowledge**, not duplicate text. Two blocks that look alike but mean different things are independent concepts – don't merge them.

## Extract duplicated logic into one home

Before writing a block, look for an existing copy. When the same rule or computation lives in more than one place, extract one shared helper and route every caller through it. Fix every call site of a bug together – a half-fixed duplicate is how a regression returns.

## When duplication is a bug

- The same business rule (tax rate, retry count, timeout) hardcoded in multiple places.
- The same validation implemented twice, one copy more thorough than the other.
- The same error-handling block across many endpoints – usually a cross-cutting concern that belongs in middleware.

## When duplication is fine

- **Test data:** inline fixtures per test; shared fixtures hide what a test actually depends on.
- **Independent domains:** two bounded contexts with a coincidentally-similar `User` type – sharing one couples them forever.
- **One-off scripts.**

## The question

"If this fact / rule / formula changes, how many places must I edit?" More than one – extract it. You will eventually forget one.
