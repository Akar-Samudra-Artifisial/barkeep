// PKGPATH: gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/townhall/v0/filetests/z1_demo
package z1_demo

import (
	"testing"

	"gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0"
	"gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/lounge/v0"
	"gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/questboard/v0"
	"gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/townhall/v0"
)

const (
	admin = address("g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p")
	alice = address("g1wymu47drhr0kuq2098m792lytgtj2nyx77yrsm")
	bob   = address("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5")
	qb    = "gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/questboard/v0"
	th    = "gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/townhall/v0"
)

// testing.SetRealm applies to the frame that calls it, so it sits in main
// right before each cross(cur) call.

func main(cur realm) {
	// Admin verifies both sources.
	testing.SetRealm(testing.NewUserRealm(admin))
	barkeep.SetSourceTier(cross(cur), qb, barkeep.TierVerified)
	barkeep.SetSourceTier(cross(cur), th, barkeep.TierVerified)
	println("townhall source:", barkeep.SourceTier(th))

	// 1. One quest: score 5, a Stranger. Both gates refuse.
	testing.SetRealm(testing.NewUserRealm(alice))
	questboard.Complete(cross(cur), "q1")
	println("score:", barkeep.ScoreOf(alice), barkeep.TierOf(alice))
	testing.SetRealm(testing.NewUserRealm(alice))
	println("sign as stranger:", revive(func() { lounge.Sign(cross(cur), "first round on me") }))
	testing.SetRealm(testing.NewUserRealm(alice))
	println("poll at 5:", revive(func() { townhall.CreatePoll(cross(cur), "Open late?", "yes|no") }))

	// 2. Two more quests: 15, Regular. The lounge opens, the poll gate not yet.
	testing.SetRealm(testing.NewUserRealm(alice))
	questboard.Complete(cross(cur), "q2")
	questboard.Complete(cross(cur), "q3")
	println("score:", barkeep.ScoreOf(alice), barkeep.TierOf(alice))
	testing.SetRealm(testing.NewUserRealm(alice))
	lounge.Sign(cross(cur), "first round on me")
	println("signatures:", lounge.Signatures())
	testing.SetRealm(testing.NewUserRealm(alice))
	println("poll at 15:", revive(func() { townhall.CreatePoll(cross(cur), "Open late?", "yes|no") }))

	// 3. One more quest: 20 reaches the poll threshold.
	testing.SetRealm(testing.NewUserRealm(alice))
	questboard.Complete(cross(cur), "q4")
	testing.SetRealm(testing.NewUserRealm(alice))
	id := townhall.CreatePoll(cross(cur), "Open late on [Fridays](x)?", " yes | no | only for Legends ")
	println("poll id:", id, "polls:", townhall.PollCount())

	// 4. Bad input is refused.
	testing.SetRealm(testing.NewUserRealm(alice))
	println("one option:", revive(func() { townhall.CreatePoll(cross(cur), "Q", "only") }))

	// 5. Votes attest in governance; a second vote panics.
	testing.SetRealm(testing.NewUserRealm(bob))
	println("bob votes:", townhall.Vote(cross(cur), id, 0), "governance:", barkeep.SourceScoreOf(bob, th))
	testing.SetRealm(testing.NewUserRealm(bob))
	println("bob again:", revive(func() { townhall.Vote(cross(cur), id, 1) }))
	testing.SetRealm(testing.NewUserRealm(bob))
	println("bad option:", revive(func() { townhall.Vote(cross(cur), id, 9) }))
	testing.SetRealm(testing.NewUserRealm(alice))
	println("alice votes:", townhall.Vote(cross(cur), id, 1))
	println("tally:", townhall.VotesOf(id, 0), townhall.VotesOf(id, 1), townhall.VotesOf(id, 2), "voted:", townhall.HasVoted(id, bob))
	println("alice governance:", barkeep.CategoryScoreOf(alice, "governance"), "score:", barkeep.ScoreOf(alice))

	// 6. Bob, a Stranger, still cannot sign.
	testing.SetRealm(testing.NewUserRealm(bob))
	println("bob signs:", revive(func() { lounge.Sign(cross(cur), "hello") }))

	println(townhall.Render(""))
	println(townhall.Render("poll/1"))
	println(townhall.Render("poll/x"))
	println(lounge.Render(""))
}

// Output:
// townhall source: verified
// score: 5 Stranger
// sign as stranger: lounge: Regulars only, come back with a Barkeep score of 10
// poll at 5: townhall: need a Barkeep score of at least 20
// score: 15 Regular
// signatures: 1
// poll at 15: townhall: need a Barkeep score of at least 20
// poll id: 1 polls: 1
// one option: townhall: a poll needs 2 to 5 options separated by |
// bob votes: true governance: 1
// bob again: townhall: already voted
// bad option: townhall: option out of range
// alice votes: true
// tally: 1 1 0 voted: true
// alice governance: 1 score: 23
// bob signs: lounge: Regulars only, come back with a Barkeep score of 10
// # Town Hall
//
// Polls by patrons of the tavern. Opening a poll needs a [Barkeep](/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0) score of 20; every vote earns governance renown.
//
// | # | Question | Votes |
// |---|---|---|
// | [1](:poll/1) | Open late on \[Fridays\]\(x\)? | 2 |
//
// # Poll 1
//
// **Open late on \[Fridays\]\(x\)?**
//
// Opened by [g1wymu47drhr0kuq2098m792lytgtj2nyx77yrsm](/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0:u/g1wymu47drhr0kuq2098m792lytgtj2nyx77yrsm) at block 123
//
// | # | Option | Votes |
// |---|---|---|
// | 0 | yes | 1 |
// | 1 | no | 1 |
// | 2 | only for Legends | 0 |
//
// [All polls](:)
//
// # Not found
//
// [All polls](:)
//
// # The Lounge
//
// VIP guestbook for Regulars and above, gated by [Barkeep](/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0).
//
// | Block | Patron | Tier | Message |
// |---|---|---|---|
// | 123 | g1wymu47drhr0kuq2098m792lytgtj2nyx77yrsm | Regular | first round on me |
