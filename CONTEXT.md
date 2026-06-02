# Domain Context

## Task

A saved reservation instruction. A Task selects Places and dates, chooses an execution method, and may opt into Schedule registration.

## Place

A reservable accommodation identified by a stable ID and a reservation query string.

## Reservation attempt

One execution for a single Place and date combination.

## Schedule registration

The automatic execution registration for an enabled Task. A Task enters Schedule registration when it has:

- a scheduled start mode; or
- a manual start mode paired with repeat or cron execution.
